import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from config import OPENROUTER_MODEL
from database import init_db
from federal_register import get_rule_detail
from llm import chat_json, stream_chat
from prompts import draft_messages, summarize_messages
from regulations import (
    CommentSubmissionError,
    list_open_proposed_rules,
    submit_comment,
)
from routers.auth import router as auth_router
from schemas import DraftRequest, SubmitRequest, SummarizeRequest


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
