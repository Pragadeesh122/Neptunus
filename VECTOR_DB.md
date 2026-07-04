# Federal Register Regulation Vector DB

A persistent vector database of U.S. Federal Register **proposed rules**, built for
semantic retrieval. Every regulation from
[`data/persona_rules_knowledge_base.json`](data/persona_rules_knowledge_base.json)
is downloaded, cleaned, chunked by document structure, embedded, and stored
together with the full metadata of the rule it belongs to.

---

## 1. At a glance

| Property | Value |
|---|---|
| Vector store | [ChromaDB](https://www.trychroma.com/) (persistent, local, on-disk) |
| Location | `data/vector_db/` |
| Collection name | `federal_register_rules` |
| Distance metric | cosine (`hnsw:space: cosine`) |
| Embedding model | `openai/text-embedding-3-large` (via OpenRouter) |
| Embedding dimensions | **3072** |
| Rules ingested | **14** unique rules (deduplicated by `document_number`) |
| Chunks stored | **274** |
| On-disk size | ~43 MB |
| Source data | Federal Register API v1 (Proposed Rules), raw full text |

The persona grouping in the source JSON is intentionally **ignored** — rules from
all personas are merged into one collection and deduplicated by document number.

---

## 2. Files

| Path | Purpose |
|---|---|
| `backend/build_vector_db.py` | Builds/rebuilds the DB end-to-end (fetch → clean → chunk → embed → store). |
| `backend/query_vector_db.py` | Reusable query helper + CLI for semantic search. |
| `data/vector_db/` | The persisted ChromaDB store (SQLite + HNSW index segments). |
| `data/persona_rules_knowledge_base.json` | Source list of rules and their URLs/metadata. |

Inside `data/vector_db/` you'll find `chroma.sqlite3` (documents + metadata) and one
or more UUID-named directories (the HNSW vector index segments). Treat the whole
folder as a unit — don't edit it by hand.

---

## 3. What is stored in each record

Each record is one **chunk** of a regulation's full text. A record consists of:

- **`id`** — stable identifier: `"<document_number>::chunk-<n>"`
  (e.g. `2026-13282::chunk-3`).
- **`document`** — the chunk's plain text (a whole structural section of the rule).
- **`embedding`** — the 3072-dim `text-embedding-3-large` vector (used for search).
- **`metadata`** — the parent rule's metadata plus this chunk's structural info.

### Metadata schema

Every chunk carries **all** of the following. Rule-level fields are identical for
all chunks of the same rule; chunk-level fields differ per chunk. Chroma only
allows scalar metadata values, so lists from the source JSON are flattened into
`"; "`-joined strings.

| Field | Type | Level | Description |
|---|---|---|---|
| `document_number` | str | rule | Federal Register document number (primary key of the rule). |
| `title` | str | rule | Full title of the rule. |
| `type` | str | rule | Document type (e.g. `Proposed Rule`). |
| `abstract` | str | rule | Official abstract/summary of the rule. |
| `publication_date` | str | rule | Publication date (`YYYY-MM-DD`). |
| `effective_on` | str | rule | Effective date, if any (else empty). |
| `agencies` | str | rule | Agency names, `"; "`-joined (e.g. `Transportation Department; Federal Aviation Administration`). |
| `agency_slugs` | str | rule | Agency slugs, `"; "`-joined. |
| `cfr_references` | str | rule | CFR references, formatted `"<title> CFR <part>"`, `"; "`-joined. |
| `regulation_id_numbers` | str | rule | RIN(s), `"; "`-joined. |
| `docket_ids` | str | rule | Docket ID(s), `"; "`-joined. |
| `topics` | str | rule | Topic tags, `"; "`-joined. |
| `commentable` | bool | rule | Whether the rule is open for public comment. |
| `comments_close_on` | str | rule | Comment deadline (`YYYY-MM-DD`) if applicable. |
| `comment_url` | str | rule | URL to submit a comment, if applicable. |
| `html_url` | str | rule | Human-readable Federal Register page. |
| `raw_text_url` | str | rule | Source of the full text that was chunked. |
| `section` | str | chunk | Top-level structural section (see below). |
| `subsection` | str | chunk | Roman-numeral subsection title within Supplementary Information (empty otherwise). |
| `page` | str | chunk | Federal Register page number the chunk starts on (empty if none seen yet). |
| `chunk_order` | int | chunk | Sequential order of the chunk within its rule (0-based). |
| `char_count` | int | chunk | Character length of the chunk text. |

---

## 4. How the text is chunked (structure-aware, no size cap)

1. **Fetch** each rule's `raw_text_url` and strip the Federal Register HTML wrapper
   (`<pre>` body) down to plain text.
2. **Track & remove** `[[Page NNNNN]]` markers, recording which page each chunk
   starts on (stored as the `page` metadata field).
3. **Split on top-level section headers**: `SUMMARY`, `DATES`, `ADDRESSES`,
   `FOR FURTHER INFORMATION CONTACT`, `SUPPLEMENTARY INFORMATION`, `AGENCY`,
   `ACTION`. Text before the first header becomes a `PREAMBLE` chunk. The
   `section` values present in the DB are:
   `PREAMBLE`, `Summary`, `Dates`, `Addresses`, `Agency`, `Action`,
   `For Further Information Contact`, `Supplementary Information`.
4. **Sub-split `SUPPLEMENTARY INFORMATION`** into its roman-numeral subsections
   (`I. Executive Summary`, `II. Authority for This Rulemaking`, …), captured in
   the `subsection` field.
5. **No semantic size cap** — each structural section is kept whole. The only
   exception is a **hard safety fallback** (`HARD_CHAR_LIMIT = 28000` chars): a
   section that physically exceeds the embedding model's ~8191-token input window
   is split on paragraph boundaries (with ~300-char overlap) purely so the
   embedding request can succeed. This only affects a few very large sections in
   the big Medicare rules. As a result chunk sizes range from ~26 chars up to
   ~28k chars.

---

## 5. Prerequisites

- Python environment with `chromadb` and `httpx` installed. The project's backend
  venv is at `backend/.venv` (managed by [uv](https://docs.astral.sh/uv/)):

  ```bash
  cd backend
  uv pip install chromadb httpx   # httpx is already a project dep
  ```

- An OpenRouter API key. Both scripts read `OPENROUTER_API_KEY` from the
  environment and fall back to a hardcoded key if unset. To use your own:

  ```bash
  export OPENROUTER_API_KEY="sk-or-v1-..."
  ```

> Note: embeddings are generated through OpenRouter's OpenAI-compatible
> `/embeddings` endpoint using the `openai/text-embedding-3-large` model.

---

## 6. How to build / rebuild the DB

Running the build script **wipes and recreates** the collection from scratch
(idempotent and reproducible):

```bash
cd backend
.venv/bin/python build_vector_db.py
```

It prints per-rule progress (chars → chunks), then the embedding progress, and
finishes with the total chunk count and the persisted path.

---

## 7. How to query / retrieve

### 7.1 CLI (quick check)

```bash
cd backend
.venv/bin/python query_vector_db.py "your question here" [n_results]
```

Example:

```bash
.venv/bin/python query_vector_db.py \
  "recent experience requirements for mechanics with an inspection rating" 3
```

Each result prints the cosine distance, chunk id, rule title, document number,
publication date, agencies, section/subsection/page, and a text preview.

### 7.2 Programmatic (import the helper)

```python
from query_vector_db import search   # from within backend/, or add it to sys.path

results = search(
    "How will Medicare negotiate prescription drug prices?",
    n_results=5,
)

for i, doc_id in enumerate(results["ids"][0]):
    meta = results["metadatas"][0][i]
    print(doc_id, meta["title"], "-", meta["section"])
    print("distance:", results["distances"][0][i])
    print(results["documents"][0][i][:300])
```

`search()` returns Chroma's standard query response with `ids`, `documents`,
`metadatas`, and `distances` (each is a list-of-lists, one inner list per query).

### 7.3 Directly with the Chroma client

```python
import chromadb

client = chromadb.PersistentClient(path="data/vector_db")   # adjust path as needed
collection = client.get_collection("federal_register_rules")

# You must supply an embedding for the query text yourself (same model!).
# See embed_query() in query_vector_db.py, then:
results = collection.query(
    query_embeddings=[query_vector],   # 3072-dim, from text-embedding-3-large
    n_results=5,
    include=["documents", "metadatas", "distances"],
)
```

> Important: the collection has **no server-side embedding function** attached —
> embeddings are computed in the scripts and passed in. Always embed queries with
> the **same** model (`openai/text-embedding-3-large`) or results will be garbage.

### 7.4 Metadata filtering (`where`)

Combine semantic search with metadata filters using Chroma's `where` clause. The
`search()` helper accepts a `where=` argument:

```python
# Only chunks from a specific rule
search("comment deadline", where={"document_number": "2026-12059"})

# Only FAA rules that are open for comment
search(
    "inspection requirements",
    where={"$and": [
        {"agency_slugs": {"$eq": "transportation-department; federal-aviation-administration"}},
        {"commentable": {"$eq": True}},
    ]},
)

# Only the SUMMARY sections
search("what does this rule do", where={"section": "Summary"})
```

Supported operators include `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`,
`$nin`, plus `$and` / `$or`. Note that list-type source fields (agencies, topics,
docket_ids, …) are stored as `"; "`-joined strings, so exact-match filters must
match the full joined string; for partial matches, filter in Python after
retrieval or use `where_document={"$contains": "..."}` for full-text substring
matching on the chunk text.

### 7.5 Fetch by id / dump everything

```python
collection.get(ids=["2026-13282::chunk-3"], include=["documents", "metadatas"])
collection.get(include=["metadatas"])   # all metadata, no vectors
collection.count()                       # 274
```

---

## 8. The 14 ingested rules

| document_number | Title (abbreviated) | Agencies |
|---|---|---|
| 2026-13364 | Schedules of Controlled Substances: Temporary Placement (5,6-Dichloro Brorphine, …) | Justice / DEA |
| 2026-12925 | Medicare Program; CY 2027 Changes to the ESRD Prospective Payment System | HHS / CMS |
| 2026-12344 | RFI: Pharmacy Benefit Manager Compensation and Data Collection | HHS / CMS |
| 2026-12059 | Medicare Drug Price Negotiation Program | HHS / CMS |
| 2026-10380 | Schedules of Controlled Substances: Placement of Diphenidine in Schedule I | Justice / DEA |
| 2026-10379 | Schedules of Controlled Substances; Removal of Exemption Status for Inactive Butalbital Products | Justice / DEA |
| 2026-10128 | Revision of Applications for Manufacturing and Procurement Quotas | Justice / DEA |
| 2026-13440 | Enabling Supersonic Overland Flight | Transportation / FAA |
| 2026-13368 | Airworthiness Directives; Airbus Helicopters | Transportation / FAA |
| 2026-13365 | Airworthiness Directives; MD Helicopters, LLC | Transportation / FAA |
| 2026-13282 | Mechanic Certification: Inspection Rating and Recent Experience Requirements | Transportation / FAA |
| 2026-13129 | Airworthiness Directives; The Boeing Company Airplanes | Transportation / FAA |
| 2026-13003 | Removing Obsolete References to Twentieth-Century Airman Certificates | Transportation / FAA |
| 2026-12922 | Transport Airplane and Propulsion Certification Modernization | Transportation / FAA |

---

## 9. Notes & caveats

- **Rebuild changes ids/vectors deterministically** but embeddings can vary
  slightly across model updates. If you change the embedding model, you must
  rebuild the whole collection (dimensions differ, e.g. large=3072 vs small=1536).
- **Query/index model must match.** Queries are only meaningful when embedded with
  `text-embedding-3-large`.
- **The venv is uv-managed.** If `uv sync` regenerates `backend/.venv`, re-run
  `uv pip install chromadb` (chromadb is not yet in the project's dependency file).
- **The DB folder is not currently git-ignored.** Decide whether to commit the
  ~43 MB store or add `data/vector_db/` to `.gitignore` and rebuild on demand.
