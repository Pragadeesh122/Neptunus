# Ingestion Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest the full text of the 14 federal rules in `data/persona_rules_knowledge_base.json` into a Pinecone index for semantic retrieval.

**Architecture:** A standalone, idempotent ingestion package (`backend/ingestion/`) run as a CLI. Flow: load rule metadata from JSON → fetch each rule's full text (PDF-safe) → recursive left→right chunking (3000/500) → OpenRouter `text-embedding-3-large` (3072-dim) → upsert into the Pinecone `neptunus-rules` index. Hand-rolled splitter, minimal dependencies, mirrors the existing hand-rolled `backend/federal_register.py` style.

**Tech Stack:** Python 3.12+, `uv`, `httpx` (async HTTP), `pinecone` (vector DB), `pypdf` (PDF fallback), `pytest` (tests). No LangChain.

## Global Constraints

- **Python** >= 3.12; package manager is `uv`. All commands run from `backend/`.
- **Backend import style:** top-level modules use flat imports (`from config import ...`). The new `ingestion` package uses **relative imports** for siblings (`from .loader import ...`) and flat imports for backend-root modules (`from config import ...`).
- **Embedding model:** `openai/text-embedding-3-large`, **dimension 3072** (fixed; must match the Pinecone index).
- **Chunking:** recursive left→right, separators `["\n\n", "\n", ". ", " ", ""]`, `chunk_size=3000`, `overlap=500`.
- **Pinecone:** index `neptunus-rules`, metric `cosine`, serverless, **default namespace** (no per-persona partitioning). Vector ID = `{document_number}#{chunk_index}` (idempotent upserts).
- **Metadata:** Pinecone-typed only (str/number/bool/list-of-str); **omit keys whose value is `None`**.
- **Async tests** call `asyncio.run(...)` from sync test functions (no `pytest-asyncio` dependency). HTTP is mocked with `httpx.MockTransport` (no `respx` dependency).
- **Secrets** come from `.env.local` (already scaffolded). Never hardcode keys.

## File Structure

```
backend/
  config.py                      MODIFY: add Pinecone + embedding config vars
  pyproject.toml                 MODIFY: add pinecone, pypdf, dev pytest
  ingestion/
    __init__.py                  CREATE: empty package marker
    splitter.py                  CREATE: recursive left→right character splitter
    loader.py                    CREATE: JSON → RuleRecord[], PDF-safe text fetch
    embedder.py                  CREATE: OpenRouter embeddings client
    vector_store.py              CREATE: Pinecone create/upsert/query + metadata sanitize
    ingest.py                    CREATE: CLI orchestrator
  tests/
    __init__.py                  CREATE: empty
    test_config.py               CREATE
    test_splitter.py             CREATE
    test_loader.py               CREATE
    test_embedder.py             CREATE
    test_vector_store.py         CREATE
    test_ingest.py               CREATE
```

Each module has one responsibility and a small, explicit interface. `ingest.py` is the only module that wires them together.

---

### Task 1: Dependencies & config

**Files:**
- Modify: `backend/pyproject.toml`
- Modify: `backend/config.py:22-27` (append after `JWT_TTL_HOURS`)
- Create: `backend/tests/__init__.py`
- Create: `backend/ingestion/__init__.py`
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `config.PINECONE_API_KEY: str`, `config.PINECONE_INDEX_NAME: str`, `config.PINECONE_CLOUD: str`, `config.PINECONE_REGION: str`, `config.EMBEDDING_MODEL: str`, `config.EMBEDDING_DIM: int`.

- [ ] **Step 1: Add dependencies**

Run (from `backend/`):
```bash
uv add pinecone pypdf
uv add --dev pytest
```
Expected: `pyproject.toml` gains `pinecone`, `pypdf` under `dependencies` and `pytest` under a dev group; `uv.lock` updates.

- [ ] **Step 2: Create package/test markers**

Create `backend/ingestion/__init__.py` (empty) and `backend/tests/__init__.py` (empty).

- [ ] **Step 3: Write the failing test**

Create `backend/tests/test_config.py`:
```python
import config


def test_embedding_defaults():
    assert config.EMBEDDING_MODEL == "openai/text-embedding-3-large"
    assert config.EMBEDDING_DIM == 3072
    assert isinstance(config.EMBEDDING_DIM, int)


def test_pinecone_defaults():
    assert config.PINECONE_INDEX_NAME == "neptunus-rules"
    assert config.PINECONE_CLOUD == "aws"
    assert config.PINECONE_REGION == "us-east-1"
    assert hasattr(config, "PINECONE_API_KEY")
```

- [ ] **Step 4: Run test to verify it fails**

Run: `uv run pytest tests/test_config.py -v`
Expected: FAIL with `AttributeError: module 'config' has no attribute 'EMBEDDING_MODEL'`.

- [ ] **Step 5: Add config vars**

Append to `backend/config.py` (after the JWT lines):
```python

# --- Ingestion pipeline: Pinecone vector DB + embeddings ---
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "neptunus-rules")
PINECONE_CLOUD = os.getenv("PINECONE_CLOUD", "aws")
PINECONE_REGION = os.getenv("PINECONE_REGION", "us-east-1")

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "openai/text-embedding-3-large")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "3072"))
```

- [ ] **Step 6: Run test to verify it passes**

Run: `uv run pytest tests/test_config.py -v`
Expected: PASS (2 passed).

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml uv.lock config.py ingestion/__init__.py tests/__init__.py tests/test_config.py
git commit -m "feat(ingestion): add pinecone/pypdf deps and embedding config"
```

---

### Task 2: Recursive left→right splitter

**Files:**
- Create: `backend/ingestion/splitter.py`
- Test: `backend/tests/test_splitter.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `split_text(text: str, chunk_size: int = 3000, overlap: int = 500, separators: list[str] | None = None) -> list[str]`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_splitter.py`:
```python
from ingestion.splitter import split_text


def test_short_text_single_chunk():
    assert split_text("hello world") == ["hello world"]


def test_char_level_size_and_overlap():
    # 5000 chars, char-level splitting → deterministic sizes + overlap
    text = "".join(str(i % 10) for i in range(5000))
    chunks = split_text(text, chunk_size=3000, overlap=500, separators=[""])
    assert len(chunks) == 2
    assert len(chunks[0]) == 3000
    assert all(len(c) <= 3000 for c in chunks)
    # 500-char overlap: tail of chunk 0 == head of chunk 1
    assert chunks[0][-500:] == chunks[1][:500]


def test_large_paragraphs_split_on_double_newline():
    p1 = "x" * 2000
    p2 = "y" * 2000
    chunks = split_text(p1 + "\n\n" + p2, chunk_size=3000, overlap=0)
    assert chunks == [p1, p2]


def test_small_paragraphs_merge_into_one_chunk():
    chunks = split_text("para one." + "\n\n" + "para two.", chunk_size=3000, overlap=0)
    assert chunks == ["para one.\n\npara two."]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_splitter.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion.splitter'`.

- [ ] **Step 3: Write the implementation**

Create `backend/ingestion/splitter.py`:
```python
"""Recursive left-to-right character splitter.

Tries each separator in order (largest structural unit first); any piece still
larger than ``chunk_size`` is recursively split with the next separator. Small
pieces are merged up to ``chunk_size`` with a trailing ``overlap`` carried into
the next chunk. Adapted from the classic recursive-character-splitter algorithm.
"""

DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", " ", ""]


def split_text(text, chunk_size=3000, overlap=500, separators=None):
    if separators is None:
        separators = DEFAULT_SEPARATORS
    return _split(text, chunk_size, overlap, separators)


def _split(text, chunk_size, overlap, separators):
    # Pick the first separator that occurs in the text (last one, "", always matches).
    separator = separators[-1]
    remaining = []
    for i, sep in enumerate(separators):
        if sep == "":
            separator = sep
            remaining = []
            break
        if sep in text:
            separator = sep
            remaining = separators[i + 1:]
            break

    splits = list(text) if separator == "" else text.split(separator)

    final = []
    good = []
    for piece in splits:
        if len(piece) <= chunk_size:
            good.append(piece)
            continue
        if good:
            final.extend(_merge(good, separator, chunk_size, overlap))
            good = []
        if remaining:
            final.extend(_split(piece, chunk_size, overlap, remaining))
        else:
            final.append(piece)  # atom larger than chunk_size, cannot split further
    if good:
        final.extend(_merge(good, separator, chunk_size, overlap))
    return final


def _merge(splits, separator, chunk_size, overlap):
    sep_len = len(separator)
    chunks = []
    current = []
    total = 0
    for piece in splits:
        added = len(piece) + (sep_len if current else 0)
        if total + added > chunk_size and current:
            joined = separator.join(current)
            if joined:
                chunks.append(joined)
            # Drop from the front until the remaining length fits the overlap window.
            while total > overlap and current:
                removed = current.pop(0)
                total -= len(removed) + (sep_len if current else 0)
        current.append(piece)
        total += len(piece) + (sep_len if len(current) > 1 else 0)
    joined = separator.join(current)
    if joined:
        chunks.append(joined)
    return chunks
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_splitter.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add ingestion/splitter.py tests/test_splitter.py
git commit -m "feat(ingestion): recursive left-to-right character splitter"
```

---

### Task 3: Loader (JSON → RuleRecord[], PDF-safe text fetch)

**Files:**
- Create: `backend/ingestion/loader.py`
- Test: `backend/tests/test_loader.py`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `RuleRecord` dataclass with fields: `document_number: str`, `title: str`, `agency_names: list[str]`, `topics: list[str]`, `personas: list[str]`, `html_url: str`, `raw_text_url: str`, `publication_date: str`, `comment_url: str | None`, `abstract: str | None`.
  - `load_rules(json_path=DEFAULT_JSON) -> list[RuleRecord]`
  - `async fetch_text(client: httpx.AsyncClient, record: RuleRecord) -> str`
  - `_is_pdf(content_type: str, body: bytes) -> bool` (helper)
  - `DEFAULT_JSON: pathlib.Path`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_loader.py`:
```python
import asyncio
import json

import httpx

from ingestion.loader import RuleRecord, load_rules, fetch_text, _is_pdf


def _write_kb(tmp_path):
    kb = {
        "total_rules": 3,
        "personas": {
            "persona_a": {"rules": [
                {"document_number": "AAA", "title": "Rule A", "type": "Proposed Rule",
                 "abstract": "abs a", "publication_date": "2026-07-01",
                 "agency_names": ["Agency One"], "topics": ["t1", "t2"],
                 "comment_url": "http://c/a", "html_url": "http://h/a",
                 "raw_text_url": "http://r/a"},
                {"document_number": "SHARED", "title": "Rule S", "type": "Proposed Rule",
                 "abstract": "abs s", "publication_date": "2026-07-02",
                 "agency_names": ["Agency One"], "topics": ["t3"],
                 "comment_url": None, "html_url": "http://h/s", "raw_text_url": "http://r/s"},
            ]},
            "persona_b": {"rules": [
                {"document_number": "SHARED", "title": "Rule S", "type": "Proposed Rule",
                 "abstract": "abs s", "publication_date": "2026-07-02",
                 "agency_names": ["Agency One"], "topics": ["t3"],
                 "comment_url": None, "html_url": "http://h/s", "raw_text_url": "http://r/s"},
            ]},
        },
    }
    path = tmp_path / "kb.json"
    path.write_text(json.dumps(kb))
    return path


def test_load_rules_dedupes_and_merges_personas(tmp_path):
    records = load_rules(_write_kb(tmp_path))
    by_num = {r.document_number: r for r in records}
    assert set(by_num) == {"AAA", "SHARED"}
    assert by_num["AAA"].personas == ["persona_a"]
    assert sorted(by_num["SHARED"].personas) == ["persona_a", "persona_b"]
    assert by_num["SHARED"].comment_url is None
    assert by_num["AAA"].topics == ["t1", "t2"]


def test_is_pdf_detects_magic_bytes_and_content_type():
    assert _is_pdf("application/pdf", b"anything")
    assert _is_pdf("text/plain", b"%PDF-1.7 ...")
    assert not _is_pdf("text/plain", b"plain words")


def test_fetch_text_returns_plain_text():
    record = RuleRecord("AAA", "Rule A", ["Agency"], [], ["p"], "http://h",
                        "http://r/a", "2026-07-01", None, "abs")

    def handler(request):
        return httpx.Response(200, text="full rule body", headers={"content-type": "text/plain"})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_text(client, record)

    assert asyncio.run(go()) == "full rule body"


def test_fetch_text_falls_back_to_abstract_when_empty():
    record = RuleRecord("AAA", "Rule A", ["Agency"], [], ["p"], "http://h",
                        "http://r/a", "2026-07-01", None, "the abstract")

    def handler(request):
        return httpx.Response(200, text="   ", headers={"content-type": "text/plain"})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_text(client, record)

    assert asyncio.run(go()) == "the abstract"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_loader.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion.loader'`.

- [ ] **Step 3: Write the implementation**

Create `backend/ingestion/loader.py`:
```python
"""Load rule metadata from the persona knowledge-base JSON and fetch full text.

Rules are grouped by persona in the source JSON; this module flattens and
dedupes them by ``document_number`` (merging persona provenance), then fetches
each rule's full text from ``raw_text_url`` with a PDF-to-text fallback.
"""
import io
from dataclasses import dataclass, field
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_JSON = REPO_ROOT / "data" / "persona_rules_knowledge_base.json"


@dataclass
class RuleRecord:
    document_number: str
    title: str
    agency_names: list
    topics: list
    personas: list
    html_url: str
    raw_text_url: str
    publication_date: str
    comment_url: object  # str | None
    abstract: object     # str | None


def load_rules(json_path=DEFAULT_JSON):
    import json
    data = json.loads(Path(json_path).read_text())
    by_num = {}
    for persona_key, persona in data.get("personas", {}).items():
        for rule in persona.get("rules", []):
            num = rule["document_number"]
            existing = by_num.get(num)
            if existing:
                if persona_key not in existing.personas:
                    existing.personas.append(persona_key)
                continue
            by_num[num] = RuleRecord(
                document_number=num,
                title=rule.get("title", ""),
                agency_names=list(rule.get("agency_names", [])),
                topics=list(rule.get("topics", [])),
                personas=[persona_key],
                html_url=rule.get("html_url", ""),
                raw_text_url=rule.get("raw_text_url", ""),
                publication_date=rule.get("publication_date", ""),
                comment_url=rule.get("comment_url"),
                abstract=rule.get("abstract"),
            )
    return list(by_num.values())


def _is_pdf(content_type, body):
    if "application/pdf" in (content_type or "").lower():
        return True
    return body[:5] == b"%PDF-"


def _pdf_to_text(body):
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(body))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


async def fetch_text(client, record):
    res = await client.get(record.raw_text_url, follow_redirects=True)
    res.raise_for_status()
    body = res.content
    content_type = res.headers.get("content-type", "")
    if _is_pdf(content_type, body):
        text = _pdf_to_text(body)
    else:
        text = res.text
    text = (text or "").strip()
    if not text:
        text = (record.abstract or "").strip()
    return text
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_loader.py -v`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add ingestion/loader.py tests/test_loader.py
git commit -m "feat(ingestion): JSON loader with dedupe and PDF-safe text fetch"
```

---

### Task 4: Embedder (OpenRouter embeddings)

**Files:**
- Create: `backend/ingestion/embedder.py`
- Test: `backend/tests/test_embedder.py`

**Interfaces:**
- Consumes: `config.OPENROUTER_API_KEY`, `config.EMBEDDING_MODEL`.
- Produces: `async embed(client: httpx.AsyncClient, texts: list[str], batch_size: int = 96) -> list[list[float]]` — returns one 3072-dim vector per input text, in input order.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_embedder.py`:
```python
import asyncio
import json

import httpx

from ingestion.embedder import embed


def test_embed_batches_and_preserves_order():
    calls = []

    def handler(request):
        payload = json.loads(request.content)
        calls.append(payload)
        # Return vectors out of order to prove we sort by "index".
        items = list(enumerate(payload["input"]))
        data = [{"index": i, "embedding": [float(i)] * 3072} for i, _ in items]
        data.reverse()
        return httpx.Response(200, json={"data": data})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await embed(client, ["a", "b", "c"], batch_size=2)

    vectors = asyncio.run(go())
    assert len(vectors) == 3
    assert all(len(v) == 3072 for v in vectors)
    # 3 texts, batch_size 2 → 2 requests ([a, b], [c]).
    assert len(calls) == 2
    assert calls[0]["model"] == "openai/text-embedding-3-large"
    assert calls[0]["input"] == ["a", "b"]
    # Order preserved within batch despite reversed response.
    assert vectors[0] == [0.0] * 3072
    assert vectors[1] == [1.0] * 3072
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_embedder.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion.embedder'`.

- [ ] **Step 3: Write the implementation**

Create `backend/ingestion/embedder.py`:
```python
"""Embed text via OpenRouter's OpenAI-compatible embeddings endpoint."""
import asyncio

import config

EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings"
MAX_RETRIES = 5


async def embed(client, texts, batch_size=96):
    vectors = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start:start + batch_size]
        vectors.extend(await _embed_batch(client, batch))
    return vectors


async def _embed_batch(client, batch):
    headers = {
        "Authorization": f"Bearer {config.OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
    }
    body = {"model": config.EMBEDDING_MODEL, "input": batch}
    for attempt in range(MAX_RETRIES):
        res = await client.post(EMBEDDINGS_URL, json=body, headers=headers)
        if res.status_code == 429:
            await asyncio.sleep(2 ** attempt)
            continue
        if res.status_code != 200:
            raise RuntimeError(f"OpenRouter embeddings {res.status_code}: {res.text}")
        data = res.json()["data"]
        data.sort(key=lambda item: item["index"])
        return [item["embedding"] for item in data]
    raise RuntimeError("OpenRouter embeddings: exhausted retries after repeated 429s")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_embedder.py -v`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add ingestion/embedder.py tests/test_embedder.py
git commit -m "feat(ingestion): OpenRouter embeddings client with batching + 429 backoff"
```

---

### Task 5: Vector store (Pinecone)

**Files:**
- Create: `backend/ingestion/vector_store.py`
- Test: `backend/tests/test_vector_store.py`

**Interfaces:**
- Consumes: `config.PINECONE_API_KEY`, `config.PINECONE_INDEX_NAME`, `config.PINECONE_CLOUD`, `config.PINECONE_REGION`, `config.EMBEDDING_DIM`.
- Produces:
  - `sanitize_metadata(meta: dict) -> dict` — drop `None`, coerce to Pinecone types.
  - `upsert_chunks(index, items: list[dict], batch_size: int = 100) -> int` — `items` are `{"id": str, "values": list[float], "metadata": dict}`; returns count upserted.
  - `get_index()` — Pinecone index handle, creating the index if missing.
  - `query(index, vector: list[float], top_k: int = 5, filter: dict | None = None)`.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_vector_store.py`:
```python
from ingestion.vector_store import sanitize_metadata, upsert_chunks


def test_sanitize_drops_none_and_coerces_lists():
    meta = {
        "content": "text",
        "chunk_index": 3,
        "comment_url": None,
        "agency_names": ["A", "B"],
        "persona": ["p1", "p2"],
    }
    clean = sanitize_metadata(meta)
    assert "comment_url" not in clean
    assert clean["chunk_index"] == 3
    assert clean["agency_names"] == ["A", "B"]
    assert clean["content"] == "text"


class _FakeIndex:
    def __init__(self):
        self.batches = []

    def upsert(self, vectors, namespace=None):
        self.batches.append(vectors)


def test_upsert_batches_and_sanitizes():
    index = _FakeIndex()
    items = [
        {"id": f"D#{i}", "values": [0.0] * 3072,
         "metadata": {"chunk_index": i, "comment_url": None, "content": "c"}}
        for i in range(250)
    ]
    count = upsert_chunks(index, items, batch_size=100)
    assert count == 250
    assert [len(b) for b in index.batches] == [100, 100, 50]
    # None stripped in every upserted vector.
    assert all("comment_url" not in v["metadata"] for b in index.batches for v in b)
    assert index.batches[0][0]["id"] == "D#0"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_vector_store.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion.vector_store'`.

- [ ] **Step 3: Write the implementation**

Create `backend/ingestion/vector_store.py`:
```python
"""Pinecone vector store: create-if-missing index, upsert, query."""
import time

import config


def sanitize_metadata(meta):
    """Coerce to Pinecone-allowed types (str/number/bool/list-of-str); drop None."""
    clean = {}
    for key, value in meta.items():
        if value is None:
            continue
        if isinstance(value, bool) or isinstance(value, (int, float, str)):
            clean[key] = value
        elif isinstance(value, list):
            clean[key] = [str(x) for x in value if x is not None]
        else:
            clean[key] = str(value)
    return clean


def upsert_chunks(index, items, batch_size=100):
    count = 0
    for start in range(0, len(items), batch_size):
        batch = items[start:start + batch_size]
        vectors = [
            {"id": it["id"], "values": it["values"],
             "metadata": sanitize_metadata(it["metadata"])}
            for it in batch
        ]
        index.upsert(vectors=vectors)
        count += len(vectors)
    return count


def get_index():
    from pinecone import Pinecone, ServerlessSpec

    pc = Pinecone(api_key=config.PINECONE_API_KEY)
    if config.PINECONE_INDEX_NAME not in pc.list_indexes().names():
        pc.create_index(
            name=config.PINECONE_INDEX_NAME,
            dimension=config.EMBEDDING_DIM,
            metric="cosine",
            spec=ServerlessSpec(cloud=config.PINECONE_CLOUD, region=config.PINECONE_REGION),
        )
        while not pc.describe_index(config.PINECONE_INDEX_NAME).status["ready"]:
            time.sleep(1)
    return pc.Index(config.PINECONE_INDEX_NAME)


def query(index, vector, top_k=5, filter=None):
    return index.query(
        vector=vector, top_k=top_k, include_metadata=True, filter=filter
    )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_vector_store.py -v`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add ingestion/vector_store.py tests/test_vector_store.py
git commit -m "feat(ingestion): Pinecone vector store (create/upsert/query)"
```

---

### Task 6: Orchestrator & CLI

**Files:**
- Create: `backend/ingestion/ingest.py`
- Test: `backend/tests/test_ingest.py`

**Interfaces:**
- Consumes: `load_rules`, `fetch_text` (loader); `split_text` (splitter); `embed` (embedder); `get_index`, `upsert_chunks` (vector_store).
- Produces:
  - `build_metadata(record: RuleRecord, chunk_index: int, chunk_text: str) -> dict`
  - `async run(json_path=DEFAULT_JSON, index=None) -> dict` — summary `{"rules": int, "chunks": int, "upserted": int, "failures": list}`.
  - `main()` — CLI entrypoint.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_ingest.py`:
```python
import asyncio

import ingestion.ingest as ingest_mod
from ingestion.ingest import build_metadata, run
from ingestion.loader import RuleRecord


def _record(num, personas):
    return RuleRecord(num, f"Title {num}", ["Agency"], ["t1"], personas,
                      "http://h", "http://r", "2026-07-01", None, "abs")


def test_build_metadata_shape():
    meta = build_metadata(_record("AAA", ["p1"]), 2, "chunk text")
    assert meta["content"] == "chunk text"
    assert meta["document_number"] == "AAA"
    assert meta["chunk_index"] == 2
    assert meta["persona"] == ["p1"]
    assert meta["source_url"] == "http://r"


def test_run_orchestrates_all_rules(monkeypatch):
    records = [_record("AAA", ["p1"]), _record("BBB", ["p2"])]

    class FakeIndex:
        def __init__(self):
            self.upserts = []

        def upsert(self, vectors, namespace=None):
            self.upserts.append(vectors)

    async def fake_fetch(client, record):
        return "x" * 7000  # forces multiple chunks at 3000/500

    async def fake_embed(client, texts, batch_size=96):
        return [[0.0] * 3072 for _ in texts]

    monkeypatch.setattr(ingest_mod, "load_rules", lambda json_path=None: records)
    monkeypatch.setattr(ingest_mod, "fetch_text", fake_fetch)
    monkeypatch.setattr(ingest_mod, "embed", fake_embed)

    index = FakeIndex()
    summary = asyncio.run(run(index=index))

    assert summary["rules"] == 2
    assert summary["chunks"] > 2
    assert summary["upserted"] == summary["chunks"]
    assert summary["failures"] == []
    # Vector IDs are document-scoped and chunk-indexed.
    all_ids = [v["id"] for batch in index.upserts for v in batch]
    assert "AAA#0" in all_ids
    assert "BBB#0" in all_ids


def test_run_isolates_per_rule_failures(monkeypatch):
    records = [_record("AAA", ["p1"]), _record("BBB", ["p2"])]

    class FakeIndex:
        def upsert(self, vectors, namespace=None):
            pass

    async def fake_fetch(client, record):
        if record.document_number == "AAA":
            raise RuntimeError("download failed")
        return "some text"

    async def fake_embed(client, texts, batch_size=96):
        return [[0.0] * 3072 for _ in texts]

    monkeypatch.setattr(ingest_mod, "load_rules", lambda json_path=None: records)
    monkeypatch.setattr(ingest_mod, "fetch_text", fake_fetch)
    monkeypatch.setattr(ingest_mod, "embed", fake_embed)

    summary = asyncio.run(run(index=FakeIndex()))
    assert summary["rules"] == 1
    assert len(summary["failures"]) == 1
    assert summary["failures"][0][0] == "AAA"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_ingest.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'ingestion.ingest'`.

- [ ] **Step 3: Write the implementation**

Create `backend/ingestion/ingest.py`:
```python
"""Ingestion orchestrator: JSON → text → chunks → embeddings → Pinecone.

Run from ``backend/``:  ``uv run python -m ingestion.ingest``
"""
import asyncio

import httpx

from .loader import DEFAULT_JSON, load_rules, fetch_text
from .splitter import split_text
from .embedder import embed
from .vector_store import get_index, upsert_chunks


def build_metadata(record, chunk_index, chunk_text):
    return {
        "content": chunk_text,
        "document_number": record.document_number,
        "chunk_index": chunk_index,
        "title": record.title,
        "agency_names": record.agency_names,
        "topics": record.topics,
        "persona": record.personas,
        "html_url": record.html_url,
        "source_url": record.raw_text_url,
        "publication_date": record.publication_date,
        "comment_url": record.comment_url,
    }


async def run(json_path=DEFAULT_JSON, index=None):
    records = load_rules(json_path)
    if index is None:
        index = get_index()
    summary = {"rules": 0, "chunks": 0, "upserted": 0, "failures": []}

    async with httpx.AsyncClient(timeout=60) as client:
        for record in records:
            try:
                text = await fetch_text(client, record)
                if not text:
                    summary["failures"].append((record.document_number, "empty text"))
                    print(f"[skip] {record.document_number}: empty text")
                    continue
                chunks = split_text(text)
                vectors = await embed(client, chunks)
                items = [
                    {
                        "id": f"{record.document_number}#{i}",
                        "values": vectors[i],
                        "metadata": build_metadata(record, i, chunk),
                    }
                    for i, chunk in enumerate(chunks)
                ]
                n = upsert_chunks(index, items)
                summary["rules"] += 1
                summary["chunks"] += len(chunks)
                summary["upserted"] += n
                print(f"[ok] {record.document_number}: {len(chunks)} chunks upserted")
            except Exception as exc:  # per-rule isolation
                summary["failures"].append((record.document_number, str(exc)))
                print(f"[fail] {record.document_number}: {exc}")
    return summary


def main():
    summary = asyncio.run(run())
    print(
        f"\nDone. rules={summary['rules']} chunks={summary['chunks']} "
        f"upserted={summary['upserted']} failures={len(summary['failures'])}"
    )
    for num, reason in summary["failures"]:
        print(f"  - {num}: {reason}")


if __name__ == "__main__":
    main()
```

> **Note:** `run()` imports `load_rules`, `fetch_text`, and `embed` into the `ingestion.ingest` namespace, which is why the tests `monkeypatch.setattr(ingest_mod, "fetch_text", ...)` rather than patching the source module. Keep these as module-level names (do not call them as `loader.fetch_text`).

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_ingest.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Run the full suite**

Run: `uv run pytest -v`
Expected: PASS (all tests green across the 6 test files).

- [ ] **Step 6: Commit**

```bash
git add ingestion/ingest.py tests/test_ingest.py
git commit -m "feat(ingestion): CLI orchestrator wiring loader→split→embed→upsert"
```

---

### Task 7: Live ingestion run (manual verification)

**Files:** none (operational). Requires `PINECONE_API_KEY` and `OPENROUTER_API_KEY` set in `.env.local`.

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: 14 rules' chunks upserted into the `neptunus-rules` Pinecone index.

- [ ] **Step 1: Confirm secrets are set**

Verify `.env.local` has non-empty `PINECONE_API_KEY` and `OPENROUTER_API_KEY`.

- [ ] **Step 2: Run the pipeline**

Run (from `backend/`): `uv run python -m ingestion.ingest`
Expected: per-rule `[ok] <document_number>: N chunks upserted` lines, then a summary with `rules=14` and `failures=0` (or an explicit list of any rules that failed to download).

- [ ] **Step 3: Verify vectors landed**

Run (from `backend/`):
```bash
uv run python -c "from ingestion.vector_store import get_index; print(get_index().describe_index_stats())"
```
Expected: `total_vector_count` > 0 (roughly the sum of chunks across the 14 rules).

- [ ] **Step 4: Smoke-test a query**

Run (from `backend/`):
```bash
uv run python -c "
import asyncio, httpx
from ingestion.embedder import embed
from ingestion.vector_store import get_index, query
async def go():
    async with httpx.AsyncClient(timeout=60) as c:
        v = (await embed(c, ['controlled substance scheduling']))[0]
    r = query(get_index(), v, top_k=3)
    for m in r['matches']:
        print(round(m['score'], 3), m['metadata']['document_number'], m['metadata']['title'][:60])
asyncio.run(go())
"
```
Expected: 3 matches printed with descending cosine scores and readable titles.

---

## Self-Review

**1. Spec coverage:**
- Source JSON + 14 rules + dedupe → Task 3. ✓
- Retrieval model (single index, default namespace, persona as provenance) → Tasks 5, 6 (metadata `persona`), Task 7 (single index). ✓
- Loader / PDF-safe / abstract fallback → Task 3. ✓
- Splitter 3000/500 left→right → Task 2. ✓
- Embedder OpenRouter 3072-dim, batching, 429 backoff → Task 4. ✓
- Vector store: create-if-missing, upsert by `{doc}#{i}`, cosine, metadata sanitize/null-omit → Task 5. ✓
- Orchestrator CLI, per-rule isolation, summary → Task 6. ✓
- Config vars + deps → Task 1. ✓
- Tests for splitter/embedder/loader/vector_store → Tasks 2–5; orchestrator → Task 6. ✓
- Live smoke → Task 7. ✓

**2. Placeholder scan:** No TBD/TODO; every code step has complete code. ✓

**3. Type consistency:** `RuleRecord` fields defined in Task 3 are used identically in Task 6 `build_metadata` (`document_number`, `title`, `agency_names`, `topics`, `personas`, `html_url`, `raw_text_url`, `publication_date`, `comment_url`). `embed(client, texts, batch_size)` signature consistent across Tasks 4 and 6. `upsert_chunks(index, items, batch_size)` and item shape `{id, values, metadata}` consistent across Tasks 5 and 6. `get_index()` consistent across Tasks 5, 6, 7. ✓
