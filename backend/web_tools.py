"""Web tools for the agent: `web_search` (DuckDuckGo) and `fetch_url`.

Neither requires an API key. `web_search` uses the `ddgs` package; `fetch_url`
downloads a page and extracts readable plain text with the stdlib HTML parser.
"""

from __future__ import annotations

import asyncio
import json
from html.parser import HTMLParser

import httpx

WEB_SEARCH_MAX_RESULTS = 6
FETCH_URL_MAX_CHARS = 15_000


# ── web_search ────────────────────────────────────────────────────────────────
def _ddg_search(query: str, max_results: int) -> list[dict]:
    from ddgs import DDGS  # imported lazily so the app boots even if absent

    with DDGS() as ddgs:
        return list(ddgs.text(query, max_results=max_results))


async def run_web_search(arguments: str | dict) -> dict:
    args = _parse_args(arguments, "query")
    query = (args.get("query") or "").strip()
    if not query:
        return {"query": "", "content": "No query provided.", "results": []}

    max_results = max(1, min(int(args.get("max_results", WEB_SEARCH_MAX_RESULTS) or WEB_SEARCH_MAX_RESULTS), 10))
    try:
        raw = await asyncio.to_thread(_ddg_search, query, max_results)
    except Exception as exc:
        return {"query": query, "content": f"Web search failed: {exc}", "results": []}

    results = []
    for r in raw:
        results.append(
            {
                "title": r.get("title", ""),
                "url": r.get("href") or r.get("url", ""),
                "snippet": r.get("body") or r.get("snippet", ""),
            }
        )

    if not results:
        return {"query": query, "content": "No web results found.", "results": []}

    lines = [f"Web search results for “{query}”:\n"]
    for i, r in enumerate(results, start=1):
        lines.append(f"[{i}] {r['title']}\n{r['url']}\n{r['snippet']}\n")
    return {"query": query, "content": "\n".join(lines), "results": results}


# ── fetch_url ─────────────────────────────────────────────────────────────────
class _TextExtractor(HTMLParser):
    _SKIP = {"script", "style", "noscript", "template", "svg", "head"}

    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in self._SKIP:
            self._skip_depth += 1
        elif tag in ("p", "br", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6"):
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP and self._skip_depth > 0:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0 and data.strip():
            self._parts.append(data)

    def text(self) -> str:
        raw = "".join(self._parts)
        lines = [ln.strip() for ln in raw.splitlines()]
        out: list[str] = []
        blank = False
        for ln in lines:
            if ln:
                out.append(ln)
                blank = False
            elif not blank:
                out.append("")
                blank = True
        return "\n".join(out).strip()


def _html_to_text(html_text: str) -> str:
    parser = _TextExtractor()
    parser.feed(html_text)
    return parser.text()


async def run_fetch_url(client: httpx.AsyncClient, arguments: str | dict) -> dict:
    args = _parse_args(arguments, "url")
    url = (args.get("url") or "").strip()
    if not url:
        return {"url": "", "content": "No URL provided."}
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        resp = await client.get(
            url,
            follow_redirects=True,
            timeout=30,
            headers={"User-Agent": "Mozilla/5.0 (compatible; NeptunusBot/1.0)"},
        )
    except Exception as exc:
        return {"url": url, "content": f"Failed to fetch the URL: {exc}"}

    if resp.status_code != 200:
        return {"url": url, "content": f"Fetch returned HTTP {resp.status_code} for {url}."}

    content_type = resp.headers.get("content-type", "")
    body = resp.text
    if "html" in content_type or body.lstrip()[:1] == "<":
        text = _html_to_text(body)
    else:
        text = body

    truncated = len(text) > FETCH_URL_MAX_CHARS
    text = text[:FETCH_URL_MAX_CHARS]
    note = "\n\n…[content truncated]" if truncated else ""
    return {"url": url, "content": f"Content of {url}:\n\n{text}{note}"}


def _parse_args(arguments: str | dict, primary: str) -> dict:
    if isinstance(arguments, str):
        try:
            return json.loads(arguments or "{}")
        except json.JSONDecodeError:
            return {primary: arguments}
    return arguments or {}


# ── Agent tool bindings ───────────────────────────────────────────────────────
WEB_SEARCH_TOOL = {
    "type": "function",
    "function": {
        "name": "web_search",
        "description": (
            "Search the public web (DuckDuckGo) for current information not in the "
            "regulation or law databases: news, agency announcements, general "
            "explanations, guidance, current events. Returns titles, URLs, and "
            "snippets. Follow up with fetch_url to read a specific result in full."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The web search query."},
                "max_results": {
                    "type": "integer",
                    "description": f"Number of results (default {WEB_SEARCH_MAX_RESULTS}, max 10).",
                },
            },
            "required": ["query"],
        },
    },
}

FETCH_URL_TOOL = {
    "type": "function",
    "function": {
        "name": "fetch_url",
        "description": (
            "Fetch a web page or document by URL and return its readable text "
            "content. Use to read a specific link the user shared or a promising "
            "web_search result. HTML is stripped to plain text; long pages are "
            "truncated."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "The full URL to fetch."},
            },
            "required": ["url"],
        },
    },
}
