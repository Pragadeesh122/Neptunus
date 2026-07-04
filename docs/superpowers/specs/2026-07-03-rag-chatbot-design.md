# RAG Chatbot Runtime Layer — Design Spec

- **Date:** 2026-07-03
- **Status:** Draft for review
- **Scope:** Backend runtime + frontend for a profile-driven, RAG-grounded regulatory-comment chatbot. **Excludes** the ingestion/embedding pipeline (built separately).

## 1. Goal

Replace the post-auth rules-list experience with a chatbot that:

1. Proactively surfaces the federal rules that may affect a user, based on their profile.
2. Lets the user deep-dive one rule and understand its concrete impact on them, conversationally.
3. Optionally — and only when the user asks — drafts a well-grounded public comment and posts it to Regulations.gov after the user reviews it.

Commenting is **never** automatic. Not every session ends in a comment.

## 2. Non-goals (out of scope)

- The ingestion/embedding pipeline (rules → chunks → OpenAI embeddings → Pinecone). Built separately by the team.
- Persisted chat history (see §8 — stateless v1).
- Multi-rule batch commenting. A deep-dive targets one rule at a time.

## 3. Fixed technical contract

| Concern | Decision |
| --- | --- |
| Vector DB | **Pinecone** |
| Embedding model | **OpenAI `text-embedding-3-large`**, **3072 dimensions** |
| Similarity metric | **cosine** (assumed; confirm with ingestion) |
| Chat / generation | Existing **OpenRouter** (`deepseek-v4-flash`) via `llm.py` |
| Posting | Existing `/submit` → Regulations.gov |
| Runtime host | Vercel serverless (stateless, 250 MB function limit) |

Runtime embeds **queries only**; the ingestion pipeline embeds documents.

## 4. Flow

### Phase 0 — Surface (automatic, on chat entry)
- Build a profile query string from the user record: `occupation`, `employmentType`, `city`/`state`, and `custom_info`.
- OpenAI-embed the profile query (3072-dim).
- Pinecone top-k search (no rule filter).
- **Group matches by `rule_id`**; rank rules by best/aggregate chunk score.
- Return a ranked list of "rules that might affect you," each with title, agency, comment deadline, and a one-line "why this may be relevant."
- **No match above the relevance threshold →** say so honestly; the user can still ask about any rule.

### Phase 1 — Explore (user selects a rule)
- Embed the user's question; Pinecone search **filtered to `rule_id`**; take top chunks.
- LLM explains the concrete impact grounded in the retrieved chunks + the user profile, and asks 1–3 targeted follow-up questions.
- Multi-turn; the user's answers accumulate as evidence for a potential comment.

### Phase 2 — Draft (only on explicit user request)
- Inputs: retrieved rule chunks + user profile + accumulated follow-up answers.
- LLM streams a grounded comment (grounded in real retrieved rule text — not head-truncation).
- Constraints reused from today's draft prompt: substantive, cites rule specifics, 250–450 words, < 4,500 chars, no em dashes, `Re: Docket No. …` header.
- Returned to the user for review/edit. **Not posted yet.**

### Phase 3 — Submit (only on explicit confirm of a reviewed draft)
- `/submit` (existing) with `documentId` from Pinecone metadata, the reviewed comment, and submitter info prefilled from profile (first/last name, email).
- Reuses existing `SubmitRequest` validation (5000-char limit, submitter-type rules).

## 5. Components

### Backend (new)
- `embeddings.py` — OpenAI `text-embedding-3-large` wrapper. `embed_query(text) -> list[float]` (3072-dim), plus batch helper.
- `vectorstore.py` — Pinecone adapter. `search(vector, top_k, rule_id=None) -> list[Match]`. **This is the only file coupled to the ingestion contract.**
- `retrieval.py` — `surface_rules_for_profile(profile) -> list[RuleCard]` (group-by-rule) and `retrieve_rule_context(rule_id, query) -> list[Chunk]`.
- `routers/chat.py` — hybrid orchestrator: light per-turn conversation state (client-supplied), a small intent router (explore / answer / draft / submit / general), SSE streaming. Draft and submit are explicit, confirmed actions — never implicitly triggered.
- `prompts.py` (extend) — impact-explanation, follow-up-question, and grounded-draft templates.
- `schemas.py` (extend) — `ChatRequest`, `ChatTurn`, `RuleCard`, `Chunk`, chat responses.

### Backend (reused)
- `llm.py` (OpenRouter chat + streaming), `regulations.py` (`submit_comment`), auth (`get_current_user`).

### Backend (superseded)
- `/rules`, `/summarize`, `/draft` (Federal Register + regulations.gov listing) are superseded by the chat flow. Kept temporarily; removed once the chat flow is verified.

### Frontend
- `app/page.tsx` (post-auth) → chat UI: opens with surfaced rule cards, streamed assistant replies (SSE), rule deep-dive, follow-up Q&A, an explicit **"Draft a comment"** action, then a **review + Post** step.

## 6. ⚠️ Ingestion ↔ runtime interface contract

Each Pinecone vector = one **chunk** of a rule. Runtime **requires** this metadata:

| Field | Purpose | Required? |
| --- | --- | --- |
| `rule_id` (or `frDocNum`) | filter to one rule; group chunks into rules | **yes** |
| `document_id` | Regulations.gov `documentId` — required to POST a comment | **yes (for posting)** |
| `docket_id` | submission + display | recommended |
| `title` | render rule list / headers | **yes** |
| `agency` | render rule list | recommended |
| `comment_end_date` | skip closed rules; show deadline | recommended |
| `text` | chunk text used to ground answers/drafts | **yes** |
| `chunk_index` | ordering/debug | optional |

- Index config: **name**, **host/region**, **metric** (assumed cosine), **namespace** strategy (assumed single namespace + `rule_id` filter) — to confirm with ingestion.
- If `document_id` is absent, the app can surface and explain rules but cannot post.
- If `text` is not stored in metadata, grounding is impossible without an ingestion-side change.

## 7. New env + dependencies

- Env: `OPENAI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX` (+ host if required). Existing `OPENROUTER_API_KEY` retained for chat.
- Deps: `openai`, `pinecone` (both lightweight; within Vercel 250 MB).

## 8. State

Backend is **stateless** (serverless): the client sends conversation history + selected `rule_id` + accumulated answers on each turn, mirroring the existing SSE endpoints. Postgres-persisted chat history is a clean later addition; out of scope for v1.

## 9. Cross-cutting fixes (folded in because the chatbot needs them)

- **CORS:** `main.py` currently allows only `http://localhost:3000` with credentials, which blocks the deployed frontend. Add the production frontend origin(s) (env-driven allowlist).
- **`init_db()` on boot:** guard startup so a DB hiccup doesn't take down non-DB endpoints. (Separately, local startup still requires `DATABASE_URL` to be set.)

## 10. Error handling & edge cases

- Phase 0 no-match → honest "nothing here looks directly relevant" message.
- OpenAI / Pinecone / OpenRouter / Regulations.gov failures → SSE `error` events (existing pattern); never a hard 500 that kills the stream mid-conversation.
- Missing `document_id` on the selected rule → allow explain/draft, disable Post with a clear reason.
- Submit validation errors surfaced to the user for correction (reuse `SubmitRequest`).

## 11. Testing

Deterministic tests on the plumbing, with OpenAI / Pinecone / Regulations.gov mocked:

- `retrieval`: grouping chunks into ranked rules; rule-filtered retrieval.
- `vectorstore` adapter: query construction, metadata mapping, filter application.
- `chat` orchestrator: intent routing; state transitions; **guardrails** that draft/submit fire only on explicit request/confirm.
- `submit`: validation + payload shape.

LLM output quality is validated manually.

## 12. Assumptions to confirm with ingestion

1. Metric = cosine.
2. Single namespace + `rule_id` metadata filter (vs. per-rule namespaces).
3. Metadata field names per §6 (esp. `text` and `document_id`).
4. `document_id` present on every chunk.

All four are isolated to `vectorstore.py`; reconciling any of them is a localized change.
