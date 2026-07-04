"""Build a persistent vector DB from the Federal Register regulation knowledge base.

Pipeline:
  1. Load every rule from data/persona_rules_knowledge_base.json (personas ignored,
     rules deduplicated by document_number).
  2. Download each rule's raw full text (raw_text_url) and strip the Federal
     Register HTML wrapper down to plain text.
  3. Structure-aware chunking: split on the document's semantic section headers
     (SUMMARY, DATES, ADDRESSES, SUPPLEMENTARY INFORMATION and its
     roman-numeral subsections, etc.), then size-cap oversized sections on
     paragraph boundaries. Page markers ([[Page NNNNN]]) are tracked so every
     chunk carries the page it starts on.
  4. Embed each chunk with OpenAI text-embedding-3-small via the OpenRouter API.
  5. Store chunks + embeddings + full rule metadata in a persistent ChromaDB
     collection at data/vector_db/.

Run:  backend/.venv/bin/python backend/build_vector_db.py
"""

from __future__ import annotations

import html
import json
import re
import sys
import time
from pathlib import Path

import chromadb
import httpx

from config import OPENROUTER_API_KEY

# --------------------------------------------------------------------------- #
# Config
# --------------------------------------------------------------------------- #
REPO_ROOT = Path(__file__).resolve().parent.parent
KB_PATH = REPO_ROOT / "data" / "persona_rules_knowledge_base.json"
DB_DIR = REPO_ROOT / "data" / "vector_db"
COLLECTION_NAME = "federal_register_rules"

# OPENROUTER_API_KEY is read from the environment / .env.local via config.py.
EMBEDDING_MODEL = "openai/text-embedding-3-large"
EMBEDDING_URL = "https://openrouter.ai/api/v1/embeddings"
EMBED_BATCH_SIZE = 16

# No semantic size cap: chunks are whole structural sections. The only limit is
# a hard safety fallback for sections that physically exceed the embedding
# model's ~8191-token input window (~32k chars); those get split on paragraph
# boundaries purely so the embedding request doesn't fail. Set conservatively
# for dense legal text.
HARD_CHAR_LIMIT = 28000
HARD_SPLIT_OVERLAP = 300

# Top-level Federal Register section headers used as split points.
SECTION_HEADER_RE = re.compile(
    r"^(SUMMARY|DATES|ADDRESSES|FOR FURTHER INFORMATION CONTACT|"
    r"SUPPLEMENTARY INFORMATION|AGENCY|ACTION)\s*:",
    re.MULTILINE,
)
# Roman-numeral top-level subsections within SUPPLEMENTARY INFORMATION,
# e.g. "I. Executive Summary", "II. Authority for This Rulemaking".
ROMAN_SECTION_RE = re.compile(r"^([IVXLC]+)\.\s+(.+)$")
PAGE_MARKER_RE = re.compile(r"\[\[Page\s+([^\]]+?)\]\]")


# --------------------------------------------------------------------------- #
# Text extraction
# --------------------------------------------------------------------------- #
def extract_plain_text(raw: str) -> str:
    """Pull the <pre> body out of a Federal Register raw-text page and un-escape it."""
    match = re.search(r"<pre>(.*)</pre>", raw, re.DOTALL | re.IGNORECASE)
    body = match.group(1) if match else raw
    body = re.sub(r"<[^>]+>", "", body)  # drop stray anchor tags etc.
    return html.unescape(body)


def fetch_text(client: httpx.Client, url: str) -> str:
    resp = client.get(url, timeout=60, follow_redirects=True)
    resp.raise_for_status()
    return extract_plain_text(resp.text)


# --------------------------------------------------------------------------- #
# Structure-aware chunking
# --------------------------------------------------------------------------- #
def _split_on_section_headers(text: str) -> list[tuple[str, str]]:
    """Split into (section_title, section_text) on top-level FR headers.

    The lead-in block before the first header (masthead / title) is returned
    under the title "PREAMBLE".
    """
    matches = list(SECTION_HEADER_RE.finditer(text))
    if not matches:
        return [("PREAMBLE", text)]

    sections: list[tuple[str, str]] = []
    if matches[0].start() > 0:
        sections.append(("PREAMBLE", text[: matches[0].start()]))

    for i, m in enumerate(matches):
        title = m.group(1).title()
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        sections.append((title, text[start:end]))
    return sections


def _split_supplementary(section_text: str) -> list[tuple[str, str]]:
    """Break SUPPLEMENTARY INFORMATION into roman-numeral subsections."""
    lines = section_text.splitlines(keepends=True)
    subsections: list[tuple[str, str]] = []
    current_title = "Supplementary Information"
    buffer: list[str] = []

    for line in lines:
        stripped = line.strip()
        m = ROMAN_SECTION_RE.match(stripped)
        # A real heading is short and title-like, not a wrapped sentence.
        is_heading = bool(m) and len(stripped) < 90 and not stripped.endswith(",")
        if is_heading:
            if buffer:
                subsections.append((current_title, "".join(buffer)))
                buffer = []
            current_title = stripped
        buffer.append(line)

    if buffer:
        subsections.append((current_title, "".join(buffer)))
    return subsections


def _hard_safety_split(text: str) -> list[str]:
    """Keep each structural section whole unless it exceeds the embedding model's
    hard input window. Only oversized sections are split (on paragraph
    boundaries, with a little overlap) so the embedding request can succeed."""
    text = text.strip()
    if not text:
        return []
    if len(text) <= HARD_CHAR_LIMIT:
        return [text]

    paragraphs = re.split(r"\n\s*\n", text)
    chunks: list[str] = []
    buffer = ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        candidate = f"{buffer}\n\n{para}" if buffer else para
        if len(candidate) <= HARD_CHAR_LIMIT:
            buffer = candidate
            continue
        if buffer:
            chunks.append(buffer)
            tail = buffer[-HARD_SPLIT_OVERLAP:]
            buffer = f"{tail}\n\n{para}"
        else:
            buffer = para
        # A single paragraph larger than the hard limit gets wrapped.
        while len(buffer) > HARD_CHAR_LIMIT:
            chunks.append(buffer[:HARD_CHAR_LIMIT])
            buffer = buffer[HARD_CHAR_LIMIT - HARD_SPLIT_OVERLAP :]
    if buffer.strip():
        chunks.append(buffer)
    return chunks


def _page_at(text: str, offset: int, page_index: list[tuple[int, str]]) -> str | None:
    """Return the page number in effect at a character offset within the cleaned text."""
    current = None
    for pos, page in page_index:
        if pos <= offset:
            current = page
        else:
            break
    return current


def strip_page_markers(text: str) -> tuple[str, list[tuple[int, str]]]:
    """Remove [[Page N]] markers from text, returning the cleaned text plus a list
    of (offset_in_cleaned_text, page_number) so callers can look up which page any
    chunk starts on. Shared by every builder so chunking behaves identically."""
    cleaned_parts: list[str] = []
    cleaned_pages: list[tuple[int, str]] = []
    last = 0
    for m in PAGE_MARKER_RE.finditer(text):
        cleaned_parts.append(text[last : m.start()])
        cleaned_len = sum(len(p) for p in cleaned_parts)
        cleaned_pages.append((cleaned_len, m.group(1).strip()))
        last = m.end()
    cleaned_parts.append(text[last:])
    return "".join(cleaned_parts), cleaned_pages


def chunk_document(text: str) -> list[dict]:
    """Structure-aware chunking, returning dicts with text + structural metadata."""
    cleaned, cleaned_pages = strip_page_markers(text)

    chunks: list[dict] = []
    order = 0
    for section_title, section_text in _split_on_section_headers(cleaned):
        if section_title == "Supplementary Information":
            units = _split_supplementary(section_text)
        else:
            units = [(section_title, section_text)]

        for unit_title, unit_text in units:
            for piece in _hard_safety_split(unit_text):
                if not piece.strip():
                    continue
                offset = cleaned.find(piece[:80]) if len(piece) >= 80 else cleaned.find(piece)
                page = _page_at(cleaned, offset if offset >= 0 else 0, cleaned_pages)
                chunks.append(
                    {
                        "text": piece.strip(),
                        "section": section_title,
                        "subsection": unit_title if unit_title != section_title else "",
                        "page": page or "",
                        "chunk_order": order,
                    }
                )
                order += 1
    return chunks


# --------------------------------------------------------------------------- #
# Metadata
# --------------------------------------------------------------------------- #
def build_rule_metadata(rule: dict) -> dict:
    """Flatten a rule's metadata into Chroma-compatible scalar values."""

    def joined(items: list) -> str:
        return "; ".join(str(i) for i in items if i)

    return {
        "document_number": rule.get("document_number", "") or "",
        "title": rule.get("title", "") or "",
        "type": rule.get("type", "") or "",
        "abstract": rule.get("abstract", "") or "",
        "publication_date": rule.get("publication_date", "") or "",
        "effective_on": rule.get("effective_on") or "",
        "agencies": joined(rule.get("agency_names", [])),
        "agency_slugs": joined(a.get("slug", "") for a in rule.get("agencies", [])),
        "cfr_references": joined(
            f"{c.get('title')} CFR {c.get('part')}" for c in rule.get("cfr_references", [])
        ),
        "regulation_id_numbers": joined(rule.get("regulation_id_numbers", [])),
        "docket_ids": joined(rule.get("docket_ids", [])),
        "topics": joined(rule.get("topics", [])),
        "commentable": bool(rule.get("commentable", False)),
        "comments_close_on": rule.get("comments_close_on") or "",
        "comment_url": rule.get("comment_url") or "",
        "html_url": rule.get("html_url", "") or "",
        "raw_text_url": rule.get("raw_text_url", "") or "",
    }


def load_rules() -> list[dict]:
    data = json.loads(KB_PATH.read_text(encoding="utf-8"))
    seen: set[str] = set()
    rules: list[dict] = []
    for persona in data.get("personas", {}).values():
        for rule in persona.get("rules", []):
            doc = rule.get("document_number")
            if doc and doc not in seen:
                seen.add(doc)
                rules.append(rule)
    return rules


# --------------------------------------------------------------------------- #
# Embeddings via OpenRouter
# --------------------------------------------------------------------------- #
def embed_batch(client: httpx.Client, texts: list[str]) -> list[list[float]]:
    resp = client.post(
        EMBEDDING_URL,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        json={"model": EMBEDDING_MODEL, "input": texts},
        timeout=120,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"OpenRouter embeddings {resp.status_code}: {resp.text[:500]}")
    payload = resp.json()
    ordered = sorted(payload["data"], key=lambda d: d["index"])
    return [d["embedding"] for d in ordered]


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> int:
    if not OPENROUTER_API_KEY:
        print("OPENROUTER_API_KEY is not set", file=sys.stderr)
        return 1

    rules = load_rules()
    print(f"Loaded {len(rules)} unique rules from {KB_PATH.name}")

    DB_DIR.mkdir(parents=True, exist_ok=True)
    chroma = chromadb.PersistentClient(path=str(DB_DIR))
    # Rebuild from scratch for reproducibility.
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
        for rule in rules:
            doc_num = rule["document_number"]
            url = rule.get("raw_text_url")
            if not url:
                print(f"  [skip] {doc_num}: no raw_text_url")
                continue
            try:
                text = fetch_text(client, url)
            except Exception as exc:  # noqa: BLE001
                print(f"  [error] {doc_num}: fetch failed: {exc}")
                continue

            chunks = chunk_document(text)
            rule_meta = build_rule_metadata(rule)
            print(
                f"  {doc_num}: {len(text):>7} chars -> {len(chunks):>3} chunks "
                f"| {rule_meta['title'][:60]}"
            )

            for chunk in chunks:
                ids.append(f"{doc_num}::chunk-{chunk['chunk_order']}")
                documents.append(chunk["text"])
                metadatas.append(
                    {
                        **rule_meta,
                        "section": chunk["section"],
                        "subsection": chunk["subsection"],
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
            time.sleep(0.2)  # be gentle with the API

    print(f"\nDone. Collection '{COLLECTION_NAME}' now holds {collection.count()} chunks.")
    print(f"Persisted at: {DB_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
