"""RegulationSearchSkill — dense retrieval over the Federal Register vector DB.

This is a self-contained retrieval tool. It can be used on its own
(``search_regulations``) or attached to the chat agent as a callable tool
(see ``REGULATION_SEARCH_TOOL`` and ``run_regulation_search`` below).

Retrieval procedure:
  1. Dense retrieval — embed the query with ``text-embedding-3-large`` and run a
     cosine-similarity search against the persistent ChromaDB collection.
  2. Reranking — we do NOT run a separate cross-encoder. Instead every retrieved
     chunk (full text + metadata) is formatted into the agent's context via
     ``format_chunks_for_context`` and the LLM itself reranks / synthesizes.

The vector DB layout and metadata schema are documented in VECTOR_DB.md.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import chromadb
import httpx

from config import OPENROUTER_API_KEY

REPO_ROOT = Path(__file__).resolve().parent.parent
DB_DIR = REPO_ROOT / "data" / "vector_db"
COLLECTION_NAME = "federal_register_rules"

EMBEDDING_MODEL = "openai/text-embedding-3-large"
EMBEDDING_URL = "https://openrouter.ai/api/v1/embeddings"

# Keep the amount of retrieved text passed to the model within a sane budget so
# the "rerank in context" step does not blow past the model's context window.
# Individual chunks range from ~26 chars to ~28k chars (VECTOR_DB.md §4).
MAX_CONTEXT_CHARS = 60_000
MAX_CHUNK_CHARS = 12_000
DEFAULT_N_RESULTS = 8
MAX_N_RESULTS = 20

# Fields that are identical across every chunk of the same rule.
_RULE_META_FIELDS = (
    "document_number",
    "title",
    "type",
    "abstract",
    "publication_date",
    "effective_on",
    "agencies",
    "agency_slugs",
    "cfr_references",
    "regulation_id_numbers",
    "docket_ids",
    "topics",
    "commentable",
    "comments_close_on",
    "comment_url",
    "html_url",
    "raw_text_url",
)

_LIST_FIELDS = ("agencies", "topics", "docket_ids", "cfr_references", "regulation_id_numbers")


class RegulationDBUnavailable(RuntimeError):
    """Raised when the vector DB cannot be opened (not built yet, etc.)."""


@lru_cache(maxsize=1)
def _collection():
    if not (DB_DIR / "chroma.sqlite3").exists():
        raise RegulationDBUnavailable(
            f"Vector DB not found at {DB_DIR}. Build it with backend/build_vector_db.py."
        )
    client = chromadb.PersistentClient(path=str(DB_DIR))
    try:
        return client.get_collection(COLLECTION_NAME)
    except Exception as exc:  # collection missing / corrupt
        raise RegulationDBUnavailable(str(exc)) from exc


async def _embed_query(client: httpx.AsyncClient, text: str) -> list[float]:
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not set")
    resp = await client.post(
        EMBEDDING_URL,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        json={"model": EMBEDDING_MODEL, "input": [text]},
        timeout=60,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"Embedding request failed ({resp.status_code}): {resp.text[:300]}")
    return resp.json()["data"][0]["embedding"]


def _split_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    return [part.strip() for part in str(value).split(";") if part.strip()]


def rule_ref(meta: dict) -> dict:
    """Rule-level summary for the frontend (camelCase, lists un-joined)."""
    return {
        "documentNumber": meta.get("document_number", ""),
        "title": meta.get("title", ""),
        "type": meta.get("type", ""),
        "abstract": meta.get("abstract", ""),
        "publicationDate": meta.get("publication_date", ""),
        "effectiveOn": meta.get("effective_on", ""),
        "agencies": _split_list(meta.get("agencies")),
        "cfrReferences": _split_list(meta.get("cfr_references")),
        "docketIds": _split_list(meta.get("docket_ids")),
        "topics": _split_list(meta.get("topics")),
        "commentable": bool(meta.get("commentable")),
        "commentsCloseOn": meta.get("comments_close_on", ""),
        "commentUrl": meta.get("comment_url", ""),
        "htmlUrl": meta.get("html_url", ""),
    }


async def search_regulations(
    client: httpx.AsyncClient,
    query: str,
    n_results: int = DEFAULT_N_RESULTS,
    where: dict | None = None,
) -> dict:
    """Dense semantic search. Returns retrieved chunks + the unique rules they
    belong to (deduplicated, ordered by best match)."""
    n_results = max(1, min(int(n_results or DEFAULT_N_RESULTS), MAX_N_RESULTS))
    embedding = await _embed_query(client, query)
    res = _collection().query(
        query_embeddings=[embedding],
        n_results=n_results,
        where=where,
        include=["documents", "metadatas", "distances"],
    )

    ids = res["ids"][0]
    docs = res["documents"][0]
    metas = res["metadatas"][0]
    dists = res["distances"][0]

    chunks: list[dict] = []
    rules: list[dict] = []
    seen_rules: set[str] = set()
    for i, chunk_id in enumerate(ids):
        meta = metas[i]
        chunks.append(
            {
                "id": chunk_id,
                "text": docs[i],
                "distance": dists[i],
                "documentNumber": meta.get("document_number", ""),
                "title": meta.get("title", ""),
                "agencies": meta.get("agencies", ""),
                "section": meta.get("section", ""),
                "subsection": meta.get("subsection", ""),
                "page": meta.get("page", ""),
                "publicationDate": meta.get("publication_date", ""),
                "commentable": bool(meta.get("commentable")),
                "commentsCloseOn": meta.get("comments_close_on", ""),
            }
        )
        doc_num = meta.get("document_number", "")
        if doc_num and doc_num not in seen_rules:
            seen_rules.add(doc_num)
            rules.append(rule_ref(meta))

    return {"query": query, "chunks": chunks, "rules": rules}


def format_chunks_for_context(chunks: list[dict]) -> str:
    """Render retrieved chunks (full text) so the agent can rerank/synthesize in
    context. Applies a total-character budget as a safety cap."""
    if not chunks:
        return "No matching regulation text was found in the vector database."

    blocks: list[str] = []
    budget = MAX_CONTEXT_CHARS
    for i, c in enumerate(chunks, start=1):
        text = c["text"] or ""
        if len(text) > MAX_CHUNK_CHARS:
            text = text[:MAX_CHUNK_CHARS] + "\n…[chunk truncated]"
        header = (
            f"[Source {i}] {c['title']}\n"
            f"Document number: {c['documentNumber']} | Agencies: {c['agencies']}\n"
            f"Section: {c['section']}"
            + (f" / {c['subsection']}" if c["subsection"] else "")
            + (f" (page {c['page']})" if c["page"] else "")
            + "\n"
            f"Published: {c['publicationDate']} | "
            + (
                f"Open for comment until {c['commentsCloseOn']}"
                if c["commentable"] and c["commentsCloseOn"]
                else ("Open for comment" if c["commentable"] else "Not open for public comment")
            )
            + f" | Cosine distance: {c['distance']:.4f}\n"
        )
        block = header + "---\n" + text
        if len(block) > budget:
            block = block[:budget] + "\n…[remaining sources omitted: context budget reached]"
            blocks.append(block)
            break
        blocks.append(block)
        budget -= len(block)

    intro = (
        "Retrieved regulation chunks (ranked by dense-retrieval similarity, "
        "closest first). Read all of them, judge which are actually relevant to "
        "the user, and rerank/synthesize accordingly. Cite rules by title and "
        "document number.\n\n"
    )
    return intro + "\n\n".join(blocks)


def list_rules() -> list[dict]:
    """Every unique rule in the collection (for browsing)."""
    got = _collection().get(include=["metadatas"])
    rules: list[dict] = []
    seen: set[str] = set()
    for meta in got["metadatas"]:
        doc_num = meta.get("document_number", "")
        if doc_num and doc_num not in seen:
            seen.add(doc_num)
            rules.append(rule_ref(meta))
    rules.sort(key=lambda r: r.get("publicationDate", ""), reverse=True)
    return rules


def get_rule_full(document_number: str) -> dict | None:
    """Full text of one rule, reassembled from its chunks in order."""
    got = _collection().get(
        where={"document_number": document_number},
        include=["documents", "metadatas"],
    )
    metas = got["metadatas"]
    docs = got["documents"]
    if not metas:
        return None

    order = sorted(range(len(metas)), key=lambda i: metas[i].get("chunk_order", 0))
    sections: list[dict] = []
    parts: list[str] = []
    for i in order:
        meta = metas[i]
        text = docs[i] or ""
        label = meta.get("section", "")
        if meta.get("subsection"):
            label = f"{label} — {meta['subsection']}"
        sections.append(
            {
                "section": meta.get("section", ""),
                "subsection": meta.get("subsection", ""),
                "page": meta.get("page", ""),
                "text": text,
            }
        )
        parts.append((f"## {label}\n\n" if label else "") + text)

    result = rule_ref(metas[order[0]])
    result["rawTextUrl"] = metas[order[0]].get("raw_text_url", "")
    result["regulationIdNumbers"] = _split_list(metas[order[0]].get("regulation_id_numbers"))
    result["sections"] = sections
    result["fullText"] = "\n\n".join(parts)
    return result


# ── Agent tool binding ────────────────────────────────────────────────────────
REGULATION_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "search_regulations",
        "description": (
            "Semantic search over a vector database of current U.S. Federal "
            "Register PROPOSED RULES (regulations). Use this whenever the user "
            "asks about specific rules, regulations, comment deadlines, or how a "
            "regulation might affect them, and to build the opening report of "
            "regulations relevant to the user. Returns the most relevant "
            "regulation text chunks (full text) with metadata. Call it multiple "
            "times with different queries to cover different aspects of the "
            "user's situation."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "Natural-language search query describing the regulation "
                        "topic, agency, or the user's situation/industry."
                    ),
                },
                "n_results": {
                    "type": "integer",
                    "description": (
                        f"How many chunks to retrieve (default {DEFAULT_N_RESULTS}, "
                        f"max {MAX_N_RESULTS})."
                    ),
                },
            },
            "required": ["query"],
        },
    },
}


async def run_regulation_search(client: httpx.AsyncClient, arguments: str | dict) -> dict:
    """Execute the tool call. Returns both the model-facing context string and
    the structured rules (for the UI 'sources' cards)."""
    if isinstance(arguments, str):
        try:
            args = json.loads(arguments or "{}")
        except json.JSONDecodeError:
            args = {"query": arguments}
    else:
        args = arguments or {}

    query = (args.get("query") or "").strip()
    if not query:
        return {"query": "", "content": "No query provided.", "rules": []}

    n_results = args.get("n_results", DEFAULT_N_RESULTS)
    result = await search_regulations(client, query, n_results=n_results)
    return {
        "query": query,
        "content": format_chunks_for_context(result["chunks"]),
        "rules": result["rules"],
    }
