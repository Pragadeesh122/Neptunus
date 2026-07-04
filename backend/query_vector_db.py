"""Query the Federal Register vector DB built by build_vector_db.py.

Usage:
    backend/.venv/bin/python backend/query_vector_db.py "your question here" [n_results]
"""

from __future__ import annotations

import sys
from pathlib import Path

import chromadb
import httpx

from config import OPENROUTER_API_KEY

REPO_ROOT = Path(__file__).resolve().parent.parent
DB_DIR = REPO_ROOT / "data" / "vector_db"
COLLECTION_NAME = "federal_register_rules"

EMBEDDING_MODEL = "openai/text-embedding-3-large"
EMBEDDING_URL = "https://openrouter.ai/api/v1/embeddings"


def embed_query(text: str) -> list[float]:
    resp = httpx.post(
        EMBEDDING_URL,
        headers={
            "Authorization": f"Bearer {OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
        },
        json={"model": EMBEDDING_MODEL, "input": [text]},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["data"][0]["embedding"]


def search(query: str, n_results: int = 5, where: dict | None = None) -> dict:
    client = chromadb.PersistentClient(path=str(DB_DIR))
    collection = client.get_collection(COLLECTION_NAME)
    return collection.query(
        query_embeddings=[embed_query(query)],
        n_results=n_results,
        where=where,
        include=["documents", "metadatas", "distances"],
    )


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    query = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 5

    results = search(query, n)
    print(f'Query: "{query}"\n' + "=" * 80)
    for i in range(len(results["ids"][0])):
        meta = results["metadatas"][0][i]
        dist = results["distances"][0][i]
        print(f"\n#{i + 1}  (cosine distance {dist:.4f})  id={results['ids'][0][i]}")
        print(f"  rule       : {meta['title'][:80]}")
        print(f"  doc_number : {meta['document_number']}   publication_date: {meta['publication_date']}")
        print(f"  agencies   : {meta['agencies']}")
        print(f"  section    : {meta['section']} | {meta['subsection']} | page {meta['page']}")
        print(f"  text       : {results['documents'][0][i][:280].strip()}...")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
