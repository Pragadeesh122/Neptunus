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
