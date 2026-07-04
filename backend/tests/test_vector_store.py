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
