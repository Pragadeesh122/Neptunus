"""Build a persistent vector DB from the related-laws (statute) knowledge base.

Companion to build_vector_db.py. Same overall pipeline and *same chunking
strategy* (structure-aware, no semantic size cap, shared page-marker handling
and embedding model), adapted to the different source format:

  * Source: data/related_laws_knowledge_base.json (Congress.gov API v3 rows).
  * The Congress.gov API requires an API key we don't have, so the full statute
    text is pulled from GovInfo instead using each law's `public_law` number:
        https://www.govinfo.gov/content/pkg/PLAW-<congress>publ<num>/html/PLAW-<congress>publ<num>.htm
    This is the same <html><body><pre> plain-text format as the Federal
    Register documents, so extraction is identical.
  * Structure-aware chunking splits on the statute's natural hierarchy:
    TITLE -> Subtitle -> SEC.  Each SEC. becomes one chunk (no size cap); the
    enclosing TITLE / Subtitle are recorded as metadata. A hard safety fallback
    only splits sections that exceed the embedding model's input window.
  * Every chunk is linked to its law's full metadata EXCEPT persona details,
    which are intentionally excluded.

Run:  backend/.venv/bin/python backend/build_laws_vector_db.py
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

import chromadb
import httpx

# Reuse the exact same extraction / chunking-size / embedding logic as the
# Federal Register builder so both stores behave identically.
from build_vector_db import (
    EMBED_BATCH_SIZE,
    EMBEDDING_MODEL,
    OPENROUTER_API_KEY,
    _hard_safety_split,
    _page_at,
    embed_batch,
    extract_plain_text,
    strip_page_markers,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
KB_PATH = REPO_ROOT / "data" / "related_laws_knowledge_base.json"
DB_DIR = REPO_ROOT / "data" / "laws_vector_db"
COLLECTION_NAME = "related_laws"

GOVINFO_URL = (
    "https://www.govinfo.gov/content/pkg/PLAW-{congress}publ{num}/html/"
    "PLAW-{congress}publ{num}.htm"
)

# Statute structural markers. Case-sensitive on purpose: GovInfo statute
# headers are uppercase ("TITLE I--", "SEC. 11001."), whereas amendatory text
# refers to lowercase "section 423.120" / "title XVIII" that must NOT be treated
# as structural boundaries.
TITLE_RE = re.compile(r"^\s*TITLE\s+[IVXLCDM]+\b")
SUBTITLE_RE = re.compile(r"^\s*Subtitle\s+[A-Z]\b")
SEC_RE = re.compile(r"^\s*SEC(?:TION)?\.?\s+\d+[A-Za-z0-9\-]*\.")


# --------------------------------------------------------------------------- #
# Fetch
# --------------------------------------------------------------------------- #
def public_law_text_url(public_law: str) -> str | None:
    """Turn a '111-203' style public-law number into its GovInfo PLAW text URL."""
    m = re.match(r"\s*(\d+)\s*-\s*(\d+)\s*$", public_law or "")
    if not m:
        return None
    return GOVINFO_URL.format(congress=m.group(1), num=m.group(2))


def fetch_text(client: httpx.Client, url: str) -> str:
    resp = client.get(url, timeout=90, follow_redirects=True)
    resp.raise_for_status()
    return extract_plain_text(resp.text)


# --------------------------------------------------------------------------- #
# Statute chunking (same strategy, statute hierarchy)
# --------------------------------------------------------------------------- #
def chunk_statute(text: str) -> list[dict]:
    """Split a public law into SEC.-level chunks, tracking TITLE/Subtitle/page.

    Boundaries are the statutory section headers. Text before the first section
    is a PREAMBLE chunk. No semantic size cap; only the shared hard safety
    fallback splits sections too large for the embedding model.
    """
    cleaned, cleaned_pages = strip_page_markers(text)
    lines = cleaned.splitlines(keepends=True)

    chunks: list[dict] = []
    order = 0
    cur_title = ""            # most recent TITLE line seen
    cur_subtitle = ""         # most recent Subtitle line seen
    buf_title = ""            # TITLE in effect for the buffered section
    buf_subtitle = ""         # Subtitle in effect for the buffered section
    cur_section = "PREAMBLE"  # section label the buffer belongs to
    buffer: list[str] = []
    pending_header: list[str] = []  # TITLE/Subtitle lines awaiting the next SEC

    def flush() -> None:
        nonlocal order
        piece_text = "".join(buffer).strip()
        if not piece_text:
            return
        for piece in _hard_safety_split(piece_text):
            if not piece.strip():
                continue
            probe = piece[:80] if len(piece) >= 80 else piece
            offset = cleaned.find(probe)
            page = _page_at(cleaned, offset if offset >= 0 else 0, cleaned_pages)
            chunks.append(
                {
                    "text": piece.strip(),
                    "section": cur_section,
                    "title_group": buf_title,
                    "subtitle": buf_subtitle,
                    "page": page or "",
                    "chunk_order": order,
                }
            )
            order += 1

    for line in lines:
        stripped = line.strip()
        if TITLE_RE.match(stripped):
            cur_title = stripped
            cur_subtitle = ""
            pending_header.append(line)
        elif SUBTITLE_RE.match(stripped):
            cur_subtitle = stripped
            pending_header.append(line)
        elif SEC_RE.match(stripped):
            flush()
            cur_section = stripped[:180]
            buf_title, buf_subtitle = cur_title, cur_subtitle
            buffer = pending_header + [line]
            pending_header = []
        else:
            buffer.append(line)

    if pending_header:
        buffer.extend(pending_header)
    flush()
    return chunks


# --------------------------------------------------------------------------- #
# Metadata (everything except persona details)
# --------------------------------------------------------------------------- #
def build_law_metadata(law: dict) -> dict:
    """Flatten a law's metadata into Chroma-compatible scalars. Persona fields
    are intentionally omitted."""

    def joined(items) -> str:
        return "; ".join(str(i) for i in items if i)

    return {
        "congress": int(law.get("congress")) if law.get("congress") is not None else -1,
        "bill_type": law.get("type", "") or "",
        "bill_number": str(law.get("number", "") or ""),
        "official_title": law.get("official_title", "") or "",
        "common_name": law.get("common_name", "") or "",
        "public_law": law.get("public_law", "") or "",
        "policy_area": law.get("policy_area", "") or "",
        "api_verified": bool(law.get("api_verified", False)),
        "role": law.get("role", "") or "",
        "related_rules": joined(law.get("related_rules", [])),
        "conflict_note": law.get("conflict_note", "") or "",
        "laws": joined(
            f"{l.get('number')} ({l.get('type')})" for l in law.get("laws", [])
        ),
        "legislation_url": law.get("legislation_url", "") or "",
        "api_detail_url": law.get("api_detail_url", "") or "",
        "api_text_url": law.get("api_text_url", "") or "",
        "api_subjects_url": law.get("api_subjects_url", "") or "",
        "api_summaries_url": law.get("api_summaries_url", "") or "",
        "govinfo_text_url": public_law_text_url(law.get("public_law", "")) or "",
    }


def load_laws() -> list[dict]:
    data = json.loads(KB_PATH.read_text(encoding="utf-8"))
    seen: set[str] = set()
    laws: list[dict] = []
    for law in data.get("laws", []):
        key = law.get("public_law") or f"{law.get('congress')}-{law.get('type')}-{law.get('number')}"
        if key not in seen:
            seen.add(key)
            laws.append(law)
    return laws


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> int:
    if not OPENROUTER_API_KEY:
        print("OPENROUTER_API_KEY is not set", file=sys.stderr)
        return 1

    laws = load_laws()
    print(f"Loaded {len(laws)} unique laws from {KB_PATH.name}")

    DB_DIR.mkdir(parents=True, exist_ok=True)
    chroma = chromadb.PersistentClient(path=str(DB_DIR))
    try:
        chroma.delete_collection(COLLECTION_NAME)
    except Exception:
        pass
    collection = chroma.create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine", "embedding_model": EMBEDDING_MODEL},
    )

    ids: list[str] = []
    documents: list[str] = []
    metadatas: list[dict] = []

    with httpx.Client() as client:
        for law in laws:
            pl = law.get("public_law", "")
            url = public_law_text_url(pl)
            if not url:
                print(f"  [skip] {pl}: cannot derive GovInfo URL")
                continue
            try:
                text = fetch_text(client, url)
            except Exception as exc:  # noqa: BLE001
                print(f"  [error] {pl}: fetch failed: {exc}")
                continue

            chunks = chunk_statute(text)
            law_meta = build_law_metadata(law)
            slug = f"PL{pl.replace('-', '_')}"
            print(
                f"  {pl}: {len(text):>8} chars -> {len(chunks):>3} chunks "
                f"| {law_meta['common_name'][:55]}"
            )

            for chunk in chunks:
                ids.append(f"{slug}::chunk-{chunk['chunk_order']}")
                documents.append(chunk["text"])
                metadatas.append(
                    {
                        **law_meta,
                        "section": chunk["section"],
                        "title_group": chunk["title_group"],
                        "subtitle": chunk["subtitle"],
                        "page": chunk["page"],
                        "chunk_order": chunk["chunk_order"],
                        "char_count": len(chunk["text"]),
                    }
                )

    print(f"\nTotal chunks to embed: {len(documents)}")

    with httpx.Client() as client:
        for start in range(0, len(documents), EMBED_BATCH_SIZE):
            batch_docs = documents[start : start + EMBED_BATCH_SIZE]
            embeddings = embed_batch(client, batch_docs)
            collection.add(
                ids=ids[start : start + EMBED_BATCH_SIZE],
                documents=batch_docs,
                embeddings=embeddings,
                metadatas=metadatas[start : start + EMBED_BATCH_SIZE],
            )
            print(f"  embedded {min(start + EMBED_BATCH_SIZE, len(documents))}/{len(documents)}")
            time.sleep(0.2)

    print(f"\nDone. Collection '{COLLECTION_NAME}' now holds {collection.count()} chunks.")
    print(f"Persisted at: {DB_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
