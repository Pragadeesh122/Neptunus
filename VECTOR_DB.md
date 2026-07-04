# Vector DBs (Regulations & Statutes)

This repo builds **two** persistent vector databases for semantic retrieval, using
the same tooling, embedding model, and chunking strategy:

1. **Federal Register proposed rules** (`data/vector_db/`) — documented in sections
   1–9 below.
2. **Related laws / statutes** (`data/laws_vector_db/`) — documented in
   [section 10](#10-related-laws-statute-vector-db).

Both stores share the extraction, page-tracking, hard-safety-split, and embedding
code in `backend/build_vector_db.py`; the statute builder imports those helpers.

---

# Part 1 — Federal Register Regulation Vector DB

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

# Part 2 — Related Laws (Statute) Vector DB

## 10. Related laws statute vector DB

A second, structurally-identical vector DB built from the statutes in
[`data/related_laws_knowledge_base.json`](data/related_laws_knowledge_base.json)
(Congress.gov API v3 rows). It uses the **same chunking strategy** as the
Federal Register DB — structure-aware, no semantic size cap, shared page-marker
handling, same embedding model — adapted to the statute hierarchy.

### 10.1 At a glance

| Property | Value |
|---|---|
| Vector store | ChromaDB (persistent, local, on-disk) |
| Location | `data/laws_vector_db/` |
| Collection name | `related_laws` |
| Distance metric | cosine |
| Embedding model | `openai/text-embedding-3-large` (via OpenRouter) |
| Embedding dimensions | **3072** |
| Laws ingested | **6** unique public laws |
| Chunks stored | **1698** |
| On-disk size | ~145 MB |
| Builder script | `backend/build_laws_vector_db.py` |

Persona details are **intentionally excluded** from the metadata (per requirements);
everything else about each law is kept.

### 10.2 Where the text comes from

The Congress.gov API requires an API key that isn't configured, so the full
statute text is pulled from **GovInfo** instead, using each law's `public_law`
number to build the package URL (no key required):

```
https://www.govinfo.gov/content/pkg/PLAW-<congress>publ<num>/html/PLAW-<congress>publ<num>.htm
```

e.g. public law `117-169` → `PLAW-117publ169`. This returns the same
`<html><body><pre>` plain-text format as the Federal Register documents, so text
extraction and page-marker handling are shared. The original Congress.gov API
URLs are still preserved in the metadata (`api_text_url`, etc.).

### 10.3 Chunking (statute hierarchy)

Same strategy, adapted to statutes:

1. Extract the `<pre>` plain text and strip `[[Page …]]` markers (statutes use
   forms like `[[Page 136 STAT. 1839]]`, captured verbatim into `page`).
2. Split on the statutory hierarchy, **case-sensitive** (GovInfo headers are
   uppercase; lowercase `section 423.120` / `title XVIII` references inside
   amendatory text are deliberately *not* treated as boundaries):
   - `TITLE <roman>` → recorded as `title_group`
   - `Subtitle <letter>` → recorded as `subtitle`
   - `SEC. <n>.` / `SECTION <n>.` → the chunk boundary, recorded as `section`
3. Each **section** becomes one chunk (no size cap). Text before the first
   section is a `PREAMBLE` chunk.
4. The shared hard safety fallback (`HARD_CHAR_LIMIT = 28000`) only splits
   sections too large for the embedding model's input window.

### 10.4 Metadata schema (statute DB)

Chunk id format: `"PL<public_law>::chunk-<n>"` (e.g. `PL117_169::chunk-8`).

| Field | Type | Level | Description |
|---|---|---|---|
| `public_law` | str | law | Public law number (e.g. `117-169`). |
| `congress` | int | law | Congress number. |
| `bill_type` | str | law | Bill type (e.g. `hr`). |
| `bill_number` | str | law | Bill number. |
| `official_title` | str | law | Official title of the act. |
| `common_name` | str | law | Common/popular name. |
| `policy_area` | str | law | Congress.gov policy area. |
| `role` | str | law | Analytical role (`authorizing`, `conflicting_prior_law`, …). |
| `related_rules` | str | law | Related rule titles, `"; "`-joined. |
| `conflict_note` | str | law | Analytical conflict annotation. |
| `laws` | str | law | Nested law refs, formatted `"<number> (<type>)"`, `"; "`-joined. |
| `api_verified` | bool | law | Whether the row was confirmed against the live API. |
| `legislation_url` | str | law | Public Congress.gov bill page. |
| `api_detail_url` | str | law | Congress.gov API detail endpoint. |
| `api_text_url` | str | law | Congress.gov API text endpoint. |
| `api_subjects_url` | str | law | Congress.gov API subjects endpoint. |
| `api_summaries_url` | str | law | Congress.gov API summaries endpoint. |
| `govinfo_text_url` | str | law | The GovInfo URL the full text was actually pulled from. |
| `section` | str | chunk | Statutory section heading (`SEC. …`) or `PREAMBLE`. |
| `title_group` | str | chunk | Enclosing `TITLE …` (empty if none). |
| `subtitle` | str | chunk | Enclosing `Subtitle …` (empty if none). |
| `page` | str | chunk | Statute page the chunk starts on (e.g. `136 STAT. 1839`). |
| `chunk_order` | int | chunk | Sequential order within the law (0-based). |
| `char_count` | int | chunk | Character length of the chunk text. |

> Note: persona fields from the source JSON (`personas`) are **not** stored.

### 10.5 Build / query

Build (wipes and recreates the `related_laws` collection):

```bash
cd backend
.venv/bin/python build_laws_vector_db.py
```

Query it exactly like the regulation DB — point the Chroma client at
`data/laws_vector_db` and the `related_laws` collection, embedding queries with
the same `text-embedding-3-large` model. `query_vector_db.py` targets the
regulation DB by default; to reuse it for statutes, change `DB_DIR` /
`COLLECTION_NAME` there or pass your own client (its `embed_query` helper works
unchanged).

### 10.6 The 6 ingested laws

| public_law | Common name | Role | Chunks |
|---|---|---|---|
| 111-203 | Dodd-Frank Wall Street Reform and Consumer Protection Act | authorizing | 566 |
| 117-169 | Inflation Reduction Act of 2022 | authorizing | 168 |
| 108-173 | Medicare Prescription Drug, Improvement, and Modernization Act (MMA) | conflicting_prior_law | 208 |
| 110-289 | Housing and Economic Recovery Act of 2008 (HERA) | authorizing | 217 |
| 117-2 | American Rescue Plan Act of 2021 (ARPA) | conflicting_prior_law | 222 |
| 119-21 | 2025 Reconciliation Act (One Big Beautiful Bill Act) | authorizing | 317 |

---

## 11. Notes & caveats

- **Rebuild changes ids/vectors deterministically** but embeddings can vary
  slightly across model updates. If you change the embedding model, you must
  rebuild the whole collection (dimensions differ, e.g. large=3072 vs small=1536).
- **Query/index model must match.** Queries are only meaningful when embedded with
  `text-embedding-3-large`.
- **The venv is uv-managed.** If `uv sync` regenerates `backend/.venv`, re-run
  `uv pip install chromadb` (chromadb is not yet in the project's dependency file).
- **The DB folders are not currently git-ignored.** Decide whether to commit the
  stores (~43 MB regulations, ~145 MB laws) or add `data/vector_db/` and
  `data/laws_vector_db/` to `.gitignore` and rebuild on demand.
