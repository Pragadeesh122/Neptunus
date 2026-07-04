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
