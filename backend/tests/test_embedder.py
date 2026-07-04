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
