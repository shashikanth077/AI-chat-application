<div align="center">

# AI Chat

**A full-stack AI chat app: React + TypeScript streaming from FastAPI, with saved conversations and retrieval-augmented answers that cite your own documents.**

[![CI](https://github.com/shashikanth077/ai-chat-application/actions/workflows/ci.yml/badge.svg)](https://github.com/shashikanth077/ai-chat-application/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React_19-20232a?logo=react&logoColor=61dafb)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)
![LangChain](https://img.shields.io/badge/LangChain-1c3c3c?logo=langchain&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003b57?logo=sqlite&logoColor=white)

### [Try the live demo](https://shashikanth077.github.io/ai-chat-application/)

<img src="docs/screenshots/chat-rag-dark.png" alt="A RAG answer with numbered citations and a source chip" width="900">

</div>

> The live demo is a **self-contained build**: the AI is simulated in your browser and your data never leaves it
> (see [Demo mode](#demo-mode)). The full-stack version, with a real model behind FastAPI, runs from this repository in two commands.

| | |
|---|---|
| <img src="docs/screenshots/welcome-dark.png" alt="Welcome screen"> | <img src="docs/screenshots/chat-markdown-dark.png" alt="Markdown, syntax-highlighted code and a table"> |
| <img src="docs/screenshots/chat-light.png" alt="Light theme"> | <img src="docs/screenshots/mobile.png" alt="Mobile layout" width="300"> |

## Highlights
- **Streaming** replies over Server-Sent Events, with Stop (the partial answer is kept) and a safe, duplicate-free **Retry** and **Regenerate** built on idempotent message ids
- **RAG with citations**: upload `.txt`, `.md` or `.pdf`; answers cite numbered passages, and a click opens the exact text and relevance score. Follow-up questions are rewritten into standalone search queries first
- **Guardrails**: secrets and personal data are refused or masked on the way in (messages and uploads) and masked on the way out (model replies, even when split across stream chunks), plus rate limits, a request-size cap, security headers and log scrubbing
- **Safe markdown**: syntax-highlighted code, tables and lists. Raw HTML, images and `javascript:` links are rendered inert (covered by tests)
- **Saved conversations** (SQLite), searchable, grouped by date, restored after a refresh; **export** any chat to Markdown
- **Polish**: light/dark themes without a flash, collapsible sidebar, keyboard shortcuts, toasts, accessible modal and menus, responsive down to phones
- **Engineering**: Pydantic validation, mapped HTTP errors, secrets never logged or sent to the browser, 359 automated tests and CI

## Quick start (full stack)
```bash
# backend (needs an API key from any OpenAI-compatible provider, e.g. OpenAI or Groq)
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cp .env.example .env     # add your key and model to .env
uvicorn main:app --reload --port 8000

# frontend, in a second terminal
cd frontend && npm install && npm run dev                    # http://localhost:5173
```
Details are in [Setup](#setup). To run **without any API key or backend**, see [Demo mode](#demo-mode).

## How it works

```mermaid
flowchart LR
    UI["React UI<br/>streams, renders markdown"] -- "POST /conversations/{id}/messages/stream" --> API["FastAPI<br/>validates, retrieves"]
    API --> DB[("SQLite<br/>conversations, chunks")]
    API -- "embed question, top passages" --> RAG["RAG<br/>sources block"]
    RAG --> LLM["OpenAI-compatible model"]
    LLM -- "token stream" --> API
    API -- "SSE: sources, deltas, done" --> UI
```

```mermaid
sequenceDiagram
    participant B as Browser
    participant S as FastAPI
    participant D as SQLite
    participant M as Model
    B->>S: message + client_message_id + use_documents
    S->>D: store the user message (once per id)
    S->>D: search chunk vectors
    S-->>B: event: sources (before any text)
    S->>M: history + sources block
    loop every token
        M-->>S: delta
        S-->>B: data: delta
    end
    S->>D: save the assistant reply and its citations
    S-->>B: event: done
```

## LangChain
The model call, document search and a follow-up-question step run on LangChain, with the rule *change the plumbing, keep the contract*: the API, SSE frames, error mapping, SQLite tables and the React app are unchanged.

```python
chain = ChatPromptTemplate.from_messages([("system", "{system}"), MessagesPlaceholder("history")]) | ChatOpenAI(...) | StrOutputParser()
```
- **`services/llm.py`**: an LCEL chain. `ChatOpenAI` takes `OPENAI_BASE_URL`, so Groq and other OpenAI-compatible providers still work. System text is a variable and history is message objects, so braces in user text are never treated as template variables. `open_reply_stream` waits for the first piece of text, so a failure before it is still a proper HTTP error.
- **`services/retriever.py`**: `SqliteRetriever(BaseRetriever)` wraps the existing cosine search; `.invoke(query)` returns `Document`s with filename, position and score in `metadata`.
- **`services/rewrite.py`**: a vague follow-up ("and how long do they nap?") is rewritten into a standalone query using recent messages, **for searching only**; the model still gets your real message. It never blocks an answer (any failure falls back to the original question), is skipped when it can't help, and costs one small extra call (`RAG_REWRITE_QUERIES=false` turns it off).
- **Deliberately not adopted:** LangChain's text splitter (the chunker is tested and mirrored in the demo with a parity test), document loaders (they need files on disk; uploads stay in memory), vector stores, LangGraph and LangSmith (it would send messages to a third party). Reasons are in `docs/AI-Chat-LangChain-Guide.html`.
- **Tests** fake the OpenAI SDK at its lowest layer, so a real `ChatOpenAI` and the real chain run. Rewrite quality with a real model is **not measured**; the tests prove the plumbing and fallbacks. Pin exact dependency versions before deploying, since LangChain's API moves.

The demo build is unaffected: its simulated assistant and client-side retrieval are not LangChain.

## Guardrails and security
Guardrails sit around the model, end to end. They are pattern-based checks, so they are a **safety net, not a guarantee** (see the limits below).

![A message with an email and phone number, masked before sending, with a notice](docs/screenshots/guardrails-masked.png)

| Where | What happens | Default |
|---|---|---|
| **Message in** | API keys, tokens, passwords and private keys are **refused** (HTTP 422, not saved, not sent). Emails, phones, card numbers (Luhn-checked), ID numbers and IBANs (checksummed) are **masked** as `[REDACTED:EMAIL]` before storing and before the model sees them | secrets `block`, personal data `redact` |
| **Reply out** | Secrets and personal data in the model's reply are masked while it streams, including a secret split across two chunks. The stored reply is the masked one | always on |
| **Upload in** | A file with a secret is refused; personal data is masked **before chunking and embedding**, so it is never indexed. A file that tries to instruct the AI ("ignore all previous instructions") gets a warning | same as messages |
| **Abuse** | Per-client rate limits (429 + `Retry-After`), a 2.5 MB request cap (413, also for chunked bodies); `X-Forwarded-For` is trusted only with `TRUST_PROXY=true` | see `.env.example` |
| **Responses** | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a `default-src 'none'` CSP and `Cache-Control: no-store` on API responses | always on |
| **Logs** | Any secret or personal data that reaches a log line is masked first (defense in depth; message text is already never logged) | always on |

What the user sees: a refused message returns to the box with an explanation (and no empty chat is left behind); a masked message shows its masked text plus a notice ("Masked 1 email address before sending"); an upload shows what was masked. The About dialog shows the active policy, and `GET /info` reports it.

```bash
GUARDRAILS=on  GUARDRAIL_SECRETS=block  GUARDRAIL_PII=redact   # the defaults; see backend/.env.example
```

**Limits, stated plainly**
- Detection is regex plus checksums: it catches well-known key formats, cards, IBANs and the like, **not names, addresses, or an unfamiliar secret format**, and a determined user can evade it (spacing, encoding). It reduces accidents; it is not data-loss prevention.
- A masked email can't be searched for or answered about. That is the intended trade.
- Prompt-injection detection is a **warning only** (easy to evade); the real defenses are the escaped `<sources>` block and never giving the model tools or secrets.
- Rate limits are in memory per process: with several workers each has its own count. Use a shared store (or your proxy's limits) when scaling out.
- **There is still no authentication.** Guardrails do not replace it; see [Security notes](#security-notes) and `docs/DEPLOY.md`.
- The demo build ports the input checks to the browser (parity-tested against the Python); it has no model, so there is no output guard.

Details and step-through flows: `docs/AI-Chat-Guardrails-Guide.html`.

## Demo mode
`VITE_DEMO=true` builds the frontend without a backend. A small in-browser stand-in (`frontend/src/demo/`) answers the same
routes, so the real services, SSE parser and UI all run unchanged:

- the "model" composes extractive answers from the retrieved passages (and a canned markdown showcase), streamed word by word
- retrieval is a TypeScript port of the backend's chunking and offline hashing embedder, **tested for parity against output generated by the Python code**
- conversations and uploads live in `localStorage`, so visitors never share data; uploads are limited to small `.txt`/`.md` files
- sample documents are preloaded so "Use my documents" works on the first message

This is what makes a public link safe: the real backend has **no authentication** and holds one shared database and your API key
(see [Security notes](#security-notes)), so it should not be exposed as-is. Build and deploy the demo with `docs/DEPLOY.md`.

```bash
cd frontend
VITE_DEMO=true npm run dev        # try it locally
VITE_DEMO=true VITE_BASE=/ai-chat-application/ npm run build   # for GitHub Pages
```

## Keyboard shortcuts
| Keys | Action |
|---|---|
| `Ctrl/Cmd` + `Shift` + `O` | New chat |
| `Ctrl/Cmd` + `B` | Show or hide the sidebar |
| `/` | Focus the message box |
| `Esc` | Stop generating |
| `Enter` / `Shift` + `Enter` | Send / new line |

## Architecture

| Layer | Location | Responsibility |
|---|---|---|
| UI components | `frontend/src/components/` | Header, sidebar, message list and bubbles, markdown and code blocks, composer, modal, menu, about dialog |
| Hooks and helpers | `frontend/src/hooks/`, `frontend/src/lib/` | Theme, toasts, shortcuts, confirm; citations, date grouping, highlighting, export (pure and unit-tested) |
| App state | `frontend/src/App.tsx` | Messages, loading, error, send/retry/regenerate/clear |
| API client | `frontend/src/services/` | `chatService.ts` (stream reader), `conversationService.ts`, `documentService.ts`, `http.ts` |
| Demo backend | `frontend/src/demo/` | In-browser API stand-in, simulated assistant, client-side RAG |
| Routes | `backend/main.py`, `backend/routers/` | HTTP endpoints, CORS, error mapping, `/info` |
| Streaming | `backend/streaming.py` | SSE framing; saves the reply however the stream ends |
| Persistence | `backend/database.py`, `backend/models.py` | SQLAlchemy; `conversations`, `messages`, `message_sources`, `documents`, `chunks` |
| RAG | `backend/services/` | `chunking`, `embeddings`, `retrieval`, `rag` (threshold, prompt building, tag escaping) |
| Schemas | `backend/schemas.py` | Pydantic request/response models and limits |
| AI service | `backend/services/llm.py` | LangChain chain (prompt, `ChatOpenAI`, parser), streaming, error classification |
| Retriever, rewrite | `backend/services/retriever.py`, `backend/services/rewrite.py` | The SQLite store as a LangChain retriever; follow-up questions rewritten before searching |

## Project structure
```
AI-chat-application/
├── frontend/          React + TypeScript + Vite
│   ├── src/ (components/, hooks/, lib/, services/, demo/, types/, test/)
│   └── e2e/smoke.cjs  Playwright smoke test (see Testing)
├── backend/           FastAPI + Pydantic + LangChain
│   ├── main.py  schemas.py  database.py  models.py  streaming.py
│   ├── routers/  services/  tests/  tools/
│   └── requirements.txt  requirements-dev.txt  .env.example
├── .github/workflows/ ci.yml (tests) and deploy-demo.yml (GitHub Pages)
└── docs/              screenshots, DEPLOY.md, testing guide, learning guides, interview questions
```

## Prerequisites
- Node.js 20+ and npm
- Python 3.11+
- An API key from an OpenAI-compatible provider (OpenAI, or Groq)

## Setup

### 1. Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # then edit .env (never commit it)
# the SQLite database file (backend/chat.db) is created on first start
uvicorn main:app --reload --port 8000
```

`backend/.env`:
```
OPENAI_API_KEY=your-key
OPENAI_MODEL=a-model-your-provider-supports
# Leave empty for OpenAI. For Groq:
OPENAI_BASE_URL=https://api.groq.com/openai/v1
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

Optional: set `VITE_API_URL` in `frontend/.env` if the backend isn't at `http://localhost:8000`. If the frontend is served from another origin, list it in the backend's `CORS_ORIGINS` (comma-separated).

## API

### `GET /info`
Public, non-secret deployment facts used by the About dialog and the model chip: app version, model name, the provider's **host** only, embedding backend, and limits. It never includes the API key or URL path.

### `GET /health`
```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

### Conversations (used by the UI)
The server stores history. The client sends only the new text, never the history.

| Method and path | Purpose | Success |
|---|---|---|
| `GET /conversations` | List saved chats, newest activity first | 200 |
| `POST /conversations` | Create an empty chat | 201 |
| `GET /conversations/{id}` | One chat with all its messages | 200 (404 if unknown) |
| `DELETE /conversations/{id}` | Delete a chat and its messages | 204 |
| `POST /conversations/{id}/messages/stream` | Add a user message, stream the reply (SSE) | 200 |

```bash
ID=$(curl -s -X POST http://localhost:8000/conversations | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
curl -N -X POST http://localhost:8000/conversations/$ID/messages/stream \
  -H "Content-Type: application/json" \
  -d '{"content":"My name is Sam","client_message_id":"msg-00000001"}'
curl -N -X POST http://localhost:8000/conversations/$ID/messages/stream \
  -H "Content-Type: application/json" \
  -d '{"content":"What is my name?","client_message_id":"msg-00000002"}'   # answers from stored context
curl -s http://localhost:8000/conversations/$ID
```

Each stored message includes `client_id` (the id the client sent for a user message), so a chat restored after a refresh can still be regenerated.

`client_message_id` (8 to 64 characters, generated by the client per message) makes sending **idempotent**:
sending the same id again is a retry. The message is not stored twice, and any partial answer that followed
it is replaced by the new one. The reply is saved when the stream ends, including a partial reply if the user
pressed Stop or the connection failed midway.

The title comes from the first message (first 50 characters). Context is the last 20 stored messages.

**Answering from documents.** Add `"use_documents": true` to the message body (default `false`). The server then
embeds the new question, keeps up to 4 passages scoring at least the relevance threshold, and the stream's
**first** frame reports them before any text:
```
event: sources
data: {"sources": [{"n": 1, "filename": "report.pdf", "position": 2, "score": 0.74, "text": "…"}]}
```
- An empty `sources` list means documents were searched and nothing was relevant; the model is told so and says the documents didn't cover it.
- No `sources` frame at all means retrieval didn't run (the flag was off, or there are no documents).
- The cited passages are saved with the answer (a snapshot, so they survive deleting the document), and `GET /conversations/{id}` returns them as `sources` on each assistant message.
- If embeddings are unavailable the request fails with `503` before streaming; the user message stays saved, so turning the switch off and retrying works.

### Documents (retrieval, Phase 12)
| Method and path | Purpose | Success | Errors |
|---|---|---|---|
| `GET /documents` | List uploaded documents, newest first | 200 | none |
| `POST /documents` | Upload one file (`multipart/form-data`, field `file`) | 201 | 413 too large, 415 wrong type, 409 library full, 422 unreadable or empty, 503 embedding model unavailable |
| `DELETE /documents/{id}` | Delete a document and its chunks | 204 | 404 |
| `POST /documents/search` | Top matching chunks for a query: `{"query": "...", "top_k": 4}` | 200 | 422, 503 |

```bash
curl -F "file=@notes.pdf" http://localhost:8000/documents
curl -X POST http://localhost:8000/documents/search -H "Content-Type: application/json" \
  -d '{"query":"what does the report say about costs?","top_k":3}'
# [{"document_id":"…","filename":"notes.pdf","position":2,"text":"…","score":0.71}, …]
```
Search always returns the `top_k` best chunks, **however poor they are**. A low `score` means "not really related"; deciding what counts as relevant is the job of the next phase.

Embeddings: the default is a small local model (`BAAI/bge-small-en-v1.5`, about 130 MB), downloaded once on the first upload or search into `backend/.model_cache/` and then fully offline. Chat can use Groq while embeddings stay local, because Groq has no embeddings API. `EMBEDDING_BACKEND=hashing` selects a built-in offline word-matching embedder for tests and development: it matches shared words, **not meaning**, and because it hashes words into 384 buckets it can occasionally give unrelated text a non-zero score (a hash collision).

### `POST /chat` and `POST /chat/stream` (stateless)
These take the whole history from the client and store nothing; they are the original Phase 6 and 10 endpoints.

### `POST /chat`
Request (the last message must be from the `user`):
```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Say hi in five words"}]}'
```
Response `200`:
```json
{ "reply": "Hello there, friend, how are you?" }
```

| Status | Meaning |
|---|---|
| 200 | Reply generated |
| 422 | Invalid body (bad role, blank/too-long content, too many messages, last message not from user) |
| 429 | Provider rate limit |
| 500 | Server misconfigured (missing key/model, or provider rejected the key) |
| 502 | Provider error, or empty reply |
| 504 | Provider timed out |

Error bodies are `{"detail": "..."}`. Upstream error text is never returned to the client.

#### Stateless streaming: `POST /chat/stream`
Same request body as `/chat`; the reply arrives as Server-Sent Events (`text/event-stream`):
```bash
curl -N -X POST http://localhost:8000/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Say hi in five words"}]}'
```
```
data: {"delta": "Hello "}

data: {"delta": "there!"}

event: done
data: {}
```
- Errors **before** the first token (422, 429, 500, 502, 504) are normal HTTP errors, exactly as for `/chat`.
- An error **after** streaming has started can't change the 200 status, so it arrives as `event: error` with `data: {"detail": "..."}`.
- A stream that ends without a `done` event means the connection was cut; the client treats it as an interrupted response.

Interactive docs: `http://localhost:8000/docs`.

## Testing

### Backend
```bash
cd backend
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```
The 187 tests cover validation, error mapping, safe error messages, CORS, streaming (including mid-stream failure and cancellation), conversation storage, idempotent retry, cascade deletes, document upload (text, markdown, PDF, limits, filename safety), chunking, embedding failures, similarity ranking, RAG prompt building (relevance threshold, prompt-injection escaping, citations surviving retries and document deletion), and that invalid input never reaches the model. Database tests use a throwaway SQLite file per test. See `docs/testing.md` for the manual end-to-end checklist.

### Frontend
```bash
cd frontend
npm install
npm test            # 172 tests (Vitest + Testing Library)
npm run lint && npx tsc -b && npm run build
```
The tests cover the pieces that are easy to get subtly wrong: the SSE frame parser (frames split across network reads, newlines in text, error and sources frames), citation linking (never inside code, never for a source that doesn't exist), date grouping (including the API's timezone-less UTC timestamps), the composer (Enter vs Shift+Enter, IME composition, Stop), **markdown safety** (script, image, iframe and `javascript:` payloads rendered inert), citations (open, close, chips), the confirm dialog (focus, Escape, focus trap), the sidebar, the documents panel (validation, drag and drop, delete confirmation), the theme hook, and a regression test that streamed text updates the existing DOM instead of rebuilding it.

### End-to-end smoke test
`frontend/e2e/smoke.cjs` drives a real browser through send, regenerate, refresh, export, shortcuts, About, search and citations. It needs Playwright (`npm i -g playwright`) and a running app:
```bash
NODE_PATH=$(npm root -g) node frontend/e2e/smoke.cjs http://localhost:5173          # full stack
NODE_PATH=$(npm root -g) node frontend/e2e/smoke.cjs http://localhost:4173/ai-chat-application/ demo   # demo build (vite preview)
```

### Continuous integration
`.github/workflows/ci.yml` runs the backend tests and the frontend lint, type-check, tests and build on every push and pull request. The tests need no API keys, network access or model download.

## Configuration and limits
| Setting | Where | Default |
|---|---|---|
| Guardrails | `GUARDRAILS`, `GUARDRAIL_SECRETS`, `GUARDRAIL_PII` in `.env` | `on`, `block`, `redact` |
| Rate limits | `RATE_LIMIT_*_PER_MINUTE` in `.env` | 30 messages, 10 uploads, 30 searches, 30 chat, 60 new chats; `0` = off |
| Request size cap | `MAX_REQUEST_BYTES` | 2,500,000 |
| Trust `X-Forwarded-For` | `TRUST_PROXY` | `false` |
| Allowed browser origins | `CORS_ORIGINS` in `.env` (comma-separated) | `http://localhost:5173`, `http://127.0.0.1:5173` |
| Max characters per message | `backend/schemas.py`, `frontend/src/constants.ts` | 4000 |
| Messages of context sent to the model | `backend/schemas.py` (`MAX_HISTORY_MESSAGES`) | 20 |
| Database | `DATABASE_URL` in `.env` | `sqlite:///backend/chat.db` |
| Upload limits | `backend/routers/documents.py` | 2 MB per file, 50 documents, 400 chunks per document |
| Chunking | `backend/services/chunking.py` | 800 characters per chunk, 100 overlap |
| Embeddings | `EMBEDDING_BACKEND`, `EMBEDDING_MODEL` in `.env` | `fastembed`, `BAAI/bge-small-en-v1.5` |
| Relevance threshold | `RAG_MIN_SCORE` in `.env` | `0.5` for the default model (a starting point: tune it, see below) |
| Passages per answer | `backend/services/rag.py` (`MAX_PASSAGES`) | 4 |
| Max reply tokens | `backend/services/llm.py` | 800 |
| Provider timeout / retries | `backend/services/llm.py` | 30 s / 2 |
| Rewrite follow-up questions before searching | `RAG_REWRITE_QUERIES` in `.env` | `true` (costs one extra small model call per follow-up) |

Keep the message-length limit in `backend/schemas.py` and `frontend/src/constants.ts` in sync.
To use PostgreSQL later, set `DATABASE_URL` (for example `postgresql+psycopg://user:pass@host/db`) and install the driver; the SQLAlchemy code is unchanged.

## Security notes
- The API key lives only in `backend/.env`, which is gitignored. The frontend never sees it.
- The system prompt is set by the server; clients can send only `user` and `assistant` roles.
- Requests are size-limited to control cost and abuse.
- The server decides the model's context from its own database. A client can't inject fake turns by sending history.
- Message text is never written to the logs.
- **Rendering model output safely.** Replies are rendered as markdown with `react-markdown`, which builds React elements and never inserts raw HTML, so a reply containing `<script>`, `<img onerror=…>` or an `<iframe>` is shown as inert text. Images are dropped entirely (a remote image URL in model output would be a tracking pixel), `javascript:` links are neutralized, and external links open in a new tab with `rel="noopener noreferrer"`. All of this is covered by tests. A Content-Security-Policy header would add defense in depth when deploying.
- **Guardrails** (see above) refuse or mask secrets and personal data in, and mask them out, so neither the database nor the model provider receives them in the default configuration. Masking happens on the server before storing: the original text is never kept.
- **Prompt injection from documents.** Retrieved text is untrusted: a document can contain "ignore your instructions". Passages are placed in the *user* turn inside a `<sources>` block (never in the system prompt), any `<sources>` tags inside them are escaped so a document can't close the block early, and the system prompt tells the model to treat the block as reference text only. This reduces the risk but cannot eliminate it: a model may still be influenced by text it reads. Don't index documents you don't trust, and never give the model tools or secrets that a document could talk it into misusing.
- Uploaded files are processed in memory and never written to disk, so there is no path-traversal or disk-filling risk from them. The filename is only a display label (directories are stripped). Size, type, document-count and chunk-count limits bound storage and compute. Note that the web framework may buffer a very large request body before the 2 MB check runs, so in production also cap request size at the reverse proxy.
- **There is no authentication yet.** Anyone who can reach the API can list, read and delete every conversation. That is fine for local use only. Before deploying, add user accounts and an ownership check on every `/conversations` route.
- CORS allows only the local dev origins unless you set `CORS_ORIGINS` to your frontend's origin(s). A wildcard is logged as a warning.
- If a key is ever pasted into chat, a log, or a commit, revoke it immediately and create a new one.

### Tuning the relevance threshold
Cosine scores are not probabilities and differ between models. The default `0.5` for `bge-small-en-v1.5` is a **starting guess**, not a measured value. Expand a citation to see its score, then adjust `RAG_MIN_SCORE`: too low and unrelated passages mislead the model; too high and real matches are dropped ("nothing relevant found"). Re-tune whenever you change the embedding model.

## Deploying
See [`docs/DEPLOY.md`](docs/DEPLOY.md): the demo on GitHub Pages (safe to make public) and the full stack on a host of your choice (add authentication first).

## Roadmap
- Authentication and per-user conversations and documents (required before any deployment)
- Better retrieval: rewrite follow-up questions into standalone ones before searching, hybrid keyword + vector search, re-ranking, an indexed vector store for large libraries

## Learning guide
- `docs/AI-Chat-Learning-Guide.html`: interactive walkthrough of how the app was built (Phases 1 to 9 concepts)
- `docs/AI-Chat-Flows-Guide.html`: step-by-step sequence diagrams of every end-to-end flow in the current app (startup, send, streaming, Stop, failures and Retry, database, conversations, UI states, security, testing, endpoints)
- `docs/AI-Chat-RAG-Flows-Guide.html`: the same style of guide for documents and RAG (upload and indexing, search and thresholds, answering with citations), with live labs for chunking, scoring, and prompt building
- `docs/AI-Chat-LangChain-Guide.html`: the LangChain integration (Phase 15): the chain, retriever and query rewriting as step-through flows, a live rewrite lab, how it is tested, and what was deliberately not adopted
- `docs/AI-Chat-Guardrails-Guide.html`: the guardrails (Phase 16): what is checked where, step-through flows, a live detector lab, streaming redaction, abuse limits, and the limits of the approach
- `docs/AI-Chat-Interview-Guide.pdf`: all 63 interview questions (Phases 1 to 16), with answers and diagrams
