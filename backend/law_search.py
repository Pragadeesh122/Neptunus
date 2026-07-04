"""LawSearchSkill — dense retrieval over the related-laws (statute) vector DB.

Mirrors regulation_search.py but targets the `related_laws` ChromaDB collection
(`data/laws_vector_db/`), which holds chunked U.S. statutes / public laws. Same
procedure: dense retrieval (text-embedding-3-large, cosine), then rerank in the
agent's context by passing full retrieved chunks.

See VECTOR_DB.md §10 for the statute DB schema. This tool is intended to be
called ONLY when the user asks about laws / statutes (not for the opening report).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import chromadb
import httpx

from regulation_search import (
    MAX_CHUNK_CHARS,
    MAX_CONTEXT_CHARS,
    RegulationDBUnavailable,
    _embed_query,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
DB_DIR = REPO_ROOT / "data" / "laws_vector_db"
COLLECTION_NAME = "related_laws"

DEFAULT_N_RESULTS = 8
MAX_N_RESULTS = 20

_LIST_FIELDS = ("related_rules", "laws")


@lru_cache(maxsize=1)
def _collection():
    if not (DB_DIR / "chroma.sqlite3").exists():
        raise RegulationDBUnavailable(
            f"Laws vector DB not found at {DB_DIR}. Build it with backend/build_laws_vector_db.py."
        )
    client = chromadb.PersistentClient(path=str(DB_DIR))
    try:
        return client.get_collection(COLLECTION_NAME)
    except Exception as exc:
        raise RegulationDBUnavailable(str(exc)) from exc


def _split_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    return [part.strip() for part in str(value).split(";") if part.strip()]


def law_ref(meta: dict) -> dict:
    return {
        "publicLaw": meta.get("public_law", ""),
        "commonName": meta.get("common_name", ""),
        "officialTitle": meta.get("official_title", ""),
        "congress": meta.get("congress", ""),
        "policyArea": meta.get("policy_area", ""),
        "role": meta.get("role", ""),
        "conflictNote": meta.get("conflict_note", ""),
        "relatedRules": _split_list(meta.get("related_rules")),
        "legislationUrl": meta.get("legislation_url", ""),
    }


async def search_laws(
    client: httpx.AsyncClient,
    query: str,
    n_results: int = DEFAULT_N_RESULTS,
    where: dict | None = None,
) -> dict:
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
    laws: list[dict] = []
    seen: set[str] = set()
    for i, chunk_id in enumerate(ids):
        meta = metas[i]
        chunks.append(
            {
                "id": chunk_id,
                "text": docs[i],
                "distance": dists[i],
                "publicLaw": meta.get("public_law", ""),
                "commonName": meta.get("common_name", ""),
                "officialTitle": meta.get("official_title", ""),
                "role": meta.get("role", ""),
                "section": meta.get("section", ""),
                "titleGroup": meta.get("title_group", ""),
                "subtitle": meta.get("subtitle", ""),
                "page": meta.get("page", ""),
            }
        )
        pl = meta.get("public_law", "")
        if pl and pl not in seen:
            seen.add(pl)
            laws.append(law_ref(meta))

    return {"query": query, "chunks": chunks, "laws": laws}


def format_law_chunks_for_context(chunks: list[dict]) -> str:
    if not chunks:
        return "No matching statute text was found in the laws vector database."

    blocks: list[str] = []
    budget = MAX_CONTEXT_CHARS
    for i, c in enumerate(chunks, start=1):
        text = c["text"] or ""
        if len(text) > MAX_CHUNK_CHARS:
            text = text[:MAX_CHUNK_CHARS] + "\n…[chunk truncated]"
        header = (
            f"[Source {i}] {c['commonName'] or c['officialTitle']} "
            f"(Public Law {c['publicLaw']})\n"
            f"Role: {c['role'] or 'n/a'} | "
            f"{c['titleGroup'] + ' / ' if c['titleGroup'] else ''}"
            f"{c['subtitle'] + ' / ' if c['subtitle'] else ''}"
            f"{c['section']}"
            + (f" (page {c['page']})" if c["page"] else "")
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
        "Retrieved statute (law) chunks ranked by dense-retrieval similarity, "
        "closest first. Read all of them, judge which are actually relevant, and "
        "rerank/synthesize. Cite laws by common name and public law number. "
        "Remember: a law (statute) is passed by Congress and stored in the U.S. "
        "Code; it is distinct from an agency rule/regulation.\n\n"
    )
    return intro + "\n\n".join(blocks)


@lru_cache(maxsize=1)
def all_laws() -> tuple[dict, ...]:
    """All unique laws with metadata (cached), for lineage linking."""
    got = _collection().get(include=["metadatas"])
    laws: dict[str, dict] = {}
    for meta in got["metadatas"]:
        pl = meta.get("public_law", "")
        if pl and pl not in laws:
            laws[pl] = law_ref(meta)
    return tuple(laws.values())


# ── Agent tool binding ────────────────────────────────────────────────────────
LAW_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "search_laws",
        "description": (
            "Semantic search over a vector database of U.S. federal STATUTES / "
            "public laws (acts of Congress, e.g. the Inflation Reduction Act, "
            "Dodd-Frank). Use ONLY when the user asks about laws/statutes, the "
            "legal authority behind a rule, or how a law affects them. Do NOT use "
            "it for the opening regulations report. Returns full statute text "
            "chunks with metadata. Call multiple times for different angles."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Natural-language query about a law, statute, or legal authority.",
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


async def run_law_search(client: httpx.AsyncClient, arguments: str | dict) -> dict:
    if isinstance(arguments, str):
        try:
            args = json.loads(arguments or "{}")
        except json.JSONDecodeError:
            args = {"query": arguments}
    else:
        args = arguments or {}

    query = (args.get("query") or "").strip()
    if not query:
        return {"query": "", "content": "No query provided.", "laws": []}

    result = await search_laws(client, query, n_results=args.get("n_results", DEFAULT_N_RESULTS))
    return {
        "query": query,
        "content": format_law_chunks_for_context(result["chunks"]),
        "laws": result["laws"],
    }
