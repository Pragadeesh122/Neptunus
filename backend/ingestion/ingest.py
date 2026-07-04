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
