# Ingestion Pipeline — Design Spec

**Date:** 2026-07-03
**Status:** Approved, pending implementation plan
**Component:** `backend/ingestion/`

## 1. Goal

Load the full text of the 14 federal rules in
`data/persona_rules_knowledge_base.json` into a single Pinecone index so the
rules can be retrieved by semantic similarity for downstream RAG (comment
drafting, Q&A). One-time-ish batch job, re-runnable safely.

## 2. Source data

`data/persona_rules_knowledge_base.json` (already committed) has:

- `total_rules: 14`, split across two personas:
  - `personas.anjali_rao_pharmacist.rules` — 7 rules
  - `personas.marcus_aircraft_mechanic.rules` — 7 rules
- Each rule carries metadata plus two full-text URLs on federalregister.gov:
  - `raw_text_url` — plain `.txt` (what we download)
  - `full_text_xml_url` — `.xml` (not used)

The two persona rule lists are expected to be disjoint by `document_number`
(different agencies: DEA/FDA/HHS vs FAA). The loader dedupes by
`document_number` defensively regardless.

## 3. Retrieval model (decisions)

- **One Pinecone index**, `neptunus-rules`, holding all 14 rules.
- **Single default namespace** — no per-persona partitioning.
- Both personas (Anjali, Marcus) query **across all rules**. Persona is stored
  as informational provenance metadata only; it is **not** a retrieval filter.

## 4. Architecture

Standalone, idempotent ingestion package in `backend/ingestion/`, run as a CLI.
Minimal dependencies, hand-rolled splitter — mirrors the existing hand-rolled
`backend/federal_register.py` style rather than pulling in LangChain.

Rejected alternatives:
- **LangChain** (langchain-text-splitters + langchain-postgres) — heavy,
  version-churny deps for one splitter we can write in ~30 lines.
- **`POST /ingest` API endpoint** — overkill for a one-time 14-rule batch;
  couples a long batch job to the web app. Can be added later if the UI ever
  needs on-demand ingestion.

### Data flow

```
JSON (14 rules)
  → loader: fetch raw_text_url (PDF-safe) per rule
  → splitter: recursive left→right, 3000 chars / 500 overlap → chunks
  → embedder: OpenRouter openai/text-embedding-3-large → 3072-dim vectors
  → vector_store: Pinecone upsert {id, values, metadata}, default namespace
```

### Module layout

```
backend/ingestion/
  __init__.py
  loader.py        JSON → rule records → full text (httpx, PDF-safe)
  splitter.py      recursive left→right character splitter
  embedder.py      OpenRouter embeddings client
  vector_store.py  Pinecone client: create-if-missing, upsert, query
  ingest.py        CLI orchestrator
```

## 5. Module responsibilities & interfaces

### `loader.py`
- `load_rules(json_path) -> list[RuleRecord]`
  - Read JSON, iterate `personas.*.rules`.
  - Dedupe by `document_number`; merge persona tags into a `persona: list[str]`.
  - Attach source metadata (title, agency_names, topics, urls, dates).
- `async fetch_text(client: httpx.AsyncClient, rule) -> str`
  - `GET rule.raw_text_url`.
  - Detect PDF via `Content-Type: application/pdf` or `%PDF` magic bytes →
    extract text with `pypdf`. Otherwise decode as text.
  - Fall back to `rule.abstract` if the download is empty.
  - Raise on total failure (caught per-rule by the orchestrator).
- Async httpx, mirroring `backend/federal_register.py`.

### `splitter.py`
- `split_text(text, chunk_size=3000, overlap=500, separators=["\n\n","\n",". "," ",""]) -> list[str]`
  - Recursive **left→right**: split on the largest separator; any piece still
    larger than `chunk_size` recurses with the next separator in the chain.
  - Merge adjacent pieces up to `chunk_size`; carry a 500-char overlap between
    emitted chunks.
  - Short text → a single chunk. Deterministic (unit-testable).

### `embedder.py`
- `embed(texts: list[str]) -> list[list[float]]`
  - `POST https://openrouter.ai/api/v1/embeddings`
  - Headers: `Authorization: Bearer {OPENROUTER_API_KEY}`, `Content-Type: application/json`
  - Body: `{ "model": EMBEDDING_MODEL, "input": [<batch of texts>] }`
  - Batched (≈96 texts/request); returns 3072-dim vectors in input order.
  - Exponential backoff on HTTP 429.

### `vector_store.py`
- `get_index()`
  - `Pinecone(api_key=PINECONE_API_KEY)`.
  - If `PINECONE_INDEX_NAME` not in `list_indexes()`, `create_index(name,
    dimension=EMBEDDING_DIM, metric="cosine", spec=ServerlessSpec(cloud=PINECONE_CLOUD,
    region=PINECONE_REGION))` and wait until ready.
  - Return the index handle.
- `upsert_chunks(index, records)`
  - Build vectors `{id, values, metadata}`; coerce metadata to Pinecone types
    (string / number / bool / list-of-strings); **omit keys whose value is None**.
  - Batch upsert (`batch_size=100`), default namespace.
- `query(index, vector, top_k=5, filter=None)` — retrieval/testing helper.

### `ingest.py` (CLI: `python -m ingestion.ingest`)
- Orchestrate: `load_rules` → for each rule `fetch_text` → `split_text` →
  collect `(chunk_text, metadata)` → `embed` in batches → `upsert_chunks`.
- Per-rule `try/except` so one failed download/embed does not abort the batch.
- Progress logging per rule; final summary (rules processed, chunks, vectors
  upserted, failures).

## 6. Config

Add to `backend/config.py` (and `.env.example` / `.env.local`):

| Var | Default | Purpose |
|---|---|---|
| `PINECONE_API_KEY` | — | Pinecone auth |
| `PINECONE_INDEX_NAME` | `neptunus-rules` | Index name |
| `PINECONE_CLOUD` | `aws` | Serverless cloud (only used on create) |
| `PINECONE_REGION` | `us-east-1` | Serverless region (only used on create) |
| `EMBEDDING_MODEL` | `openai/text-embedding-3-large` | OpenRouter embedding model |
| `EMBEDDING_DIM` | `3072` | Vector dimension; must match index |

Reuses existing `OPENROUTER_API_KEY`.

## 7. Vector schema

- **ID:** `{document_number}#{chunk_index}` — idempotent re-runs (upsert
  overwrites the same IDs; no duplicates).
- **Values:** 3072-dim float vector.
- **Metadata** (nulls omitted; a 3000-char chunk ≈ 3 KB, well under Pinecone's
  40 KB/vector limit):
  - `content` — the chunk text (so queries return text directly)
  - `document_number`, `chunk_index`
  - `title`, `agency_names[]`, `topics[]`, `persona[]`
  - `html_url`, `source_url`, `publication_date`
  - `comment_url` (only if present)

## 8. Dependencies

Add to `backend/pyproject.toml`, regenerate `requirements.txt` via `uv`:
- `pinecone` (current SDK: `Pinecone` class + `ServerlessSpec`)
- `pypdf` (PDF-to-text fallback)

Already present: `httpx`, `psycopg2-binary`, `pydantic`, `python-dotenv`.

## 9. Error handling

- **Per-rule isolation** — one failed download/embed logs and is skipped; batch
  continues.
- **429 backoff** on the OpenRouter embed call.
- **Empty-text guard** — fall back to `abstract`; skip rule if still empty.
- **Dimension mismatch** — if an existing index's dimension ≠ 3072, surface a
  clear error rather than upserting.

## 10. Testing

Unit tests (no network):
- `test_splitter.py` — chunks ≤ 3000, overlap present between adjacent chunks,
  separator order respected, short text → single chunk.
- `test_embedder.py` — mocked httpx; asserts request body (model, `input`
  array) and that returned vectors are length 3072.
- `test_loader.py` — mocked httpx for text vs PDF (`%PDF` magic bytes) branches;
  dedupe-by-`document_number` logic.
- `test_vector_store.py` — mocked Pinecone client; metadata coercion + null
  omission + list types; upsert batching.

Optional live smoke test (env-guarded, not in CI): a tiny real run against
Pinecone asserting index readiness and a sample similarity query.

## 11. Out of scope (YAGNI)

- Retrieval API endpoint / RAG query route (this spec covers ingestion only).
- Re-embedding on model change / migration tooling.
- XML/section-aware chunking (raw text only for now).
- Per-persona namespaces or filters (all rules queried together).
