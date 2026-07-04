# Public Comment Copilot

Reads live proposed federal rules open for comment, explains them in plain
English, asks about your situation, and drafts a substantive public comment
citing specific sections — which **you** review and submit yourself on
Regulations.gov. Nothing is auto-submitted.

## Architecture

Next.js frontend (pure client, no server code) → calls a FastAPI backend
directly (CORS enabled). LLM responses stream back over SSE — the draft
comment writes itself token-by-token on screen.

## Setup

```bash
cp .env.example .env.local        # fill in your keys (single env file, shared)

# terminal 1 — backend on :8000
cd backend && uv sync && uv run uvicorn main:app --reload

# terminal 2 — frontend on :3000
yarn dev
```

- `REGULATIONS_GOV_API_KEY` — from https://open.gsa.gov/api/regulationsgov/ (`DEMO_KEY` works for light testing)
- `OPENROUTER_API_KEY` — from https://openrouter.ai/keys
- `OPENROUTER_MODEL` — any OpenRouter slug, swap freely
- `NEXT_PUBLIC_API_URL` — where the browser finds the backend (default `http://localhost:8000`)

## Backend endpoints

| Endpoint | Returns |
| --- | --- |
| `GET /rules` | JSON list of proposed rules open for comment (Regulations.gov v4) |
| `POST /summarize` | SSE: `status`* → `result` (plain-English summary + 3 interview questions) |
| `POST /draft` | SSE: `status`* → `delta`* (comment tokens) → `done` |
| `POST /submit` | Posts the comment via the official commenting API (JSON, not SSE) |

All streams emit `error` events instead of raising, so the frontend always
gets a readable message. Full rule text comes from the Federal Register API
(keyless) via `frDocNum`, head-truncated to 60k chars (FR docs front-load the
preamble, which is the useful part). Stateless by design: no DB, `/draft`
refetches rule text.

## Layout

```
backend/          FastAPI: main.py (routes+SSE), regulations.py,
                  federal_register.py, llm.py, prompts.py, schemas.py
app/page.tsx      wizard UI: browse → summary → draft
lib/api.ts        API_URL + SSE-over-fetch parser
lib/types.ts      shared TS types (mirror backend/schemas.py)
```

## API reference

- **Regulations.gov v4**: https://open.gsa.gov/api/regulationsgov/ — official docs + OpenAPI spec (`v4/openapi.yaml` on that page). Our query params are verified against it. Auth via `X-Api-Key` header; rate limits per https://api.data.gov/docs/rate-limits/ (DEMO_KEY is demo-only).
- **Comment length**: Regulations.gov rejects comments over 5,000 characters — the drafter targets under 4,500 and the UI shows a live counter.
- **Direct submission**: `POST /submit` wires up the official commenting API (`POST /v4/comments`, `Content-Type: application/vnd.api+json`). It requires a comment-activated key: contact the Regulations.gov help desk with org name, address, phone, tax ID, and the first 5 digits of your key. Until then the endpoint returns a clear 403 message and the manual submit link is the working path. The UI requires a human certification checkbox before submitting, per the API's Terms of Participation. Set `REGULATIONS_GOV_API_BASE` to the staging URL to test without touching production.
- **Federal Register API** (full rule text, no key): https://www.federalregister.gov/developers/documentation/api/v1
