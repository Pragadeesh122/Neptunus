import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from auth import get_current_user
from config import OPENROUTER_MODEL
from database import init_db
from federal_register import get_rule_detail
from llm import chat_json, stream_chat, stream_completion
from prompts import chat_messages, draft_messages, summarize_messages
from regulation_search import (
    REGULATION_SEARCH_TOOL,
    RegulationDBUnavailable,
    get_rule_full,
    list_rules,
    run_regulation_search,
)
from regulations import (
    CommentSubmissionError,
    list_open_proposed_rules,
    submit_comment,
)
from routers.auth import router as auth_router
from schemas import ChatRequest, DraftRequest, SubmitRequest, SummarizeRequest

MAX_TOOL_ROUNDS = 5


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    app.state.client = httpx.AsyncClient(timeout=30)
    yield
    await app.state.client.aclose()


app = FastAPI(title="Public Comment Copilot API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)

SSE_HEADERS = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def sse_response(gen: AsyncIterator[str]) -> StreamingResponse:
    return StreamingResponse(gen, media_type="text/event-stream", headers=SSE_HEADERS)


@app.get("/rules")
async def rules(request: Request):
    try:
        result = await list_open_proposed_rules(request.app.state.client)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"rules": result}


@app.post("/submit")
async def submit(req: SubmitRequest, request: Request):
    try:
        result = await submit_comment(request.app.state.client, req)
    except CommentSubmissionError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return result


@app.post("/chat")
async def chat(
    req: ChatRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    client = request.app.state.client

    async def gen() -> AsyncIterator[str]:
        try:
            messages = chat_messages(user, req.messages)
            tools = [REGULATION_SEARCH_TOOL]

            for _ in range(MAX_TOOL_ROUNDS):
                content_buf = ""
                tool_calls: list[dict] = []
                async for kind, payload in stream_completion(
                    client, messages, tools=tools, temperature=0.4
                ):
                    if kind == "content":
                        content_buf += payload  # type: ignore[operator]
                        yield sse("delta", {"text": payload})
                    elif kind == "final":
                        tool_calls = payload["tool_calls"]  # type: ignore[index]

                if not tool_calls:
                    break

                # Record the assistant's tool-call turn, then run each tool.
                messages.append(
                    {
                        "role": "assistant",
                        "content": content_buf or None,
                        "tool_calls": [
                            {
                                "id": tc["id"],
                                "type": "function",
                                "function": {
                                    "name": tc["name"],
                                    "arguments": tc["arguments"],
                                },
                            }
                            for tc in tool_calls
                        ],
                    }
                )

                for tc in tool_calls:
                    if tc["name"] == "search_regulations":
                        result = await run_regulation_search(client, tc["arguments"])
                        yield sse("tool", {"name": "search_regulations", "query": result["query"]})
                        if result["rules"]:
                            yield sse("sources", {"rules": result["rules"]})
                        tool_content = result["content"]
                    else:
                        tool_content = f"Unknown tool: {tc['name']}"
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "name": tc["name"],
                            "content": tool_content,
                        }
                    )
            else:
                # Hit the tool-round cap: force a final answer with no more tools.
                async for delta in stream_chat(client, messages, temperature=0.4):
                    yield sse("delta", {"text": delta})

            yield sse("done", {})
        except RegulationDBUnavailable as exc:
            yield sse("error", {"error": f"Regulation database unavailable: {exc}"})
        except Exception as exc:
            yield sse("error", {"error": str(exc)})

    return sse_response(gen())


@app.get("/regulations")
async def regulations():
    try:
        return {"rules": list_rules()}
    except RegulationDBUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/regulations/{document_number}")
async def regulation_detail(document_number: str):
    try:
        rule = get_rule_full(document_number)
    except RegulationDBUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    if rule is None:
        raise HTTPException(status_code=404, detail="Regulation not found")
    return rule


@app.post("/summarize")
async def summarize(req: SummarizeRequest, request: Request):
    client = request.app.state.client

    async def gen() -> AsyncIterator[str]:
        try:
            yield sse("status", {"message": "Fetching the full rule text…"})
            detail = await get_rule_detail(client, req.frDocNum)
            yield sse("status", {"message": f"Reading the rule with {OPENROUTER_MODEL}…"})
            summary = await chat_json(client, summarize_messages(detail), temperature=0.2)
            yield sse(
                "result",
                {
                    "summary": summary,
                    "detail": {
                        "title": detail.title,
                        "abstract": detail.abstract,
                        "commentUrl": detail.commentUrl,
                        "htmlUrl": detail.htmlUrl,
                        "agencies": detail.agencies,
                    },
                },
            )
        except Exception as exc:
            yield sse("error", {"error": str(exc)})

    return sse_response(gen())


@app.post("/draft")
async def draft(req: DraftRequest, request: Request):
    client = request.app.state.client

    async def gen() -> AsyncIterator[str]:
        try:
            yield sse("status", {"message": "Fetching the full rule text…"})
            detail = await get_rule_detail(client, req.frDocNum)
            yield sse("status", {"message": "Drafting your comment…"})
            messages = draft_messages(detail, req.docketId, req.situation, req.answers)
            async for delta in stream_chat(client, messages, temperature=0.6):
                yield sse("delta", {"text": delta})
            yield sse("done", {})
        except Exception as exc:
            yield sse("error", {"error": str(exc)})

    return sse_response(gen())
