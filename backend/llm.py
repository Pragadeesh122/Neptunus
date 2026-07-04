import json
import re
from collections.abc import AsyncIterator

import httpx

from config import OPENROUTER_API_KEY, OPENROUTER_MODEL

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def _headers() -> dict:
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY is not set")
    return {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "X-Title": "Public Comment Copilot",
    }


async def chat_json(
    client: httpx.AsyncClient, messages: list[dict], temperature: float = 0.4
) -> dict:
    res = await client.post(
        OPENROUTER_URL,
        headers=_headers(),
        json={
            "model": OPENROUTER_MODEL,
            "messages": messages,
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        },
        timeout=120,
    )
    if res.status_code != 200:
        raise RuntimeError(f"OpenRouter {res.status_code}: {res.text}")

    content = res.json()["choices"][0]["message"]["content"]
    # Some models wrap JSON in markdown fences even in JSON mode.
    stripped = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.IGNORECASE)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        raise RuntimeError(f"Model returned invalid JSON: {content[:500]}")


async def stream_chat(
    client: httpx.AsyncClient, messages: list[dict], temperature: float = 0.4
) -> AsyncIterator[str]:
    async with client.stream(
        "POST",
        OPENROUTER_URL,
        headers=_headers(),
        json={
            "model": OPENROUTER_MODEL,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        },
        timeout=120,
    ) as res:
        if res.status_code != 200:
            body = await res.aread()
            raise RuntimeError(f"OpenRouter {res.status_code}: {body.decode()}")

        async for line in res.aiter_lines():
            # OpenRouter emits ": OPENROUTER PROCESSING" keep-alive comments.
            if not line.startswith("data: "):
                continue
            data = line[len("data: "):]
            if data == "[DONE]":
                break
            delta = json.loads(data)["choices"][0]["delta"].get("content")
            if delta:
                yield delta
