# AI Chat Application

A full-stack AI chat app: a React + TypeScript frontend talks to a FastAPI backend, which calls an
OpenAI-compatible chat model (OpenAI, or Groq via a base URL). Built as a learning portfolio project.

## Features
- Polished chat UI: replies render as **markdown** (headings, lists, tables, code blocks with a copy button), with a welcome screen of suggested prompts, a typing indicator, and a streaming caret
- Light and dark themes (follows your system until you choose; remembered)
- Smart auto-scroll: follows the answer only while you're at the bottom, with a "jump to latest" button when you've scrolled up
- Enter to send, Shift+Enter for a new line; the message box grows with your text
- Streaming replies: text appears as it is generated, with a Stop button
- Chat with your documents (RAG): upload `.txt`, `.md` or `.pdf`; answers are grounded in the most relevant passages, with numbered citations: click an inline `[1]` or a source chip to read the exact passage. A "Use my documents" switch turns it on or off
- Document library: files are split into chunks, embedded locally, stored in SQLite, and searchable on their own
- Saved conversations (SQLite): a sidebar of past chats, grouped by date (Today, Yesterday, …), that survives refreshes and server restarts
- Conversation context: follow-up questions work; the server loads the last 20 stored messages itself
- Clear Chat (deletes the open conversation), error messages with a safe, duplicate-free Retry
- Input limits (4000 characters per message) shown with a live counter
- Responsive layout: on phones the sidebar becomes a slide-in drawer; uploads also work by drag and drop
- Accessible: keyboard-friendly, labelled controls, a real modal confirm dialog (focus trap, Escape) instead of the browser pop-up
- Server-side validation with Pydantic; safe, mapped HTTP errors
- API key kept on the backend and never logged or sent to the browser
- Automated tests: 96 backend (pytest) and 71 frontend (Vitest), plus a CI workflow that runs both

## Architecture

```
React UI → fetch → FastAPI (POST /conversations/{id}/messages/stream)
                      → Pydantic validation → SQLite (store message, load last 20)
                      → [if "Use my documents"] embed the question → top passages above a
                        relevance threshold → <sources> block in the user turn
                      → OpenAI SDK → model
        ←── SSE text pieces ←── (assistant reply saved when the stream ends) ←──┘
```

| Layer | Location | Responsibility |
|---|---|---|
| UI components | `frontend/src/components/` | Header, message list and bubbles, markdown renderer, composer, confirm dialog (each with its own CSS) |
| Hooks and helpers | `frontend/src/hooks/`, `frontend/src/lib/` | Theme and confirm hooks; citation linking and date grouping (pure, unit-tested) |
| App state | `frontend/src/App.tsx` | Messages, loading, error, send/retry/clear |
| API client | `frontend/src/services/` | `chatService.ts` (stream reader), `conversationService.ts` (CRUD), `http.ts` (errors) |
| Sidebar | `frontend/src/components/Sidebar.tsx` | Saved chats, New chat, delete |
| Documents panel | `frontend/src/components/DocumentsPanel.tsx` | Upload, list, delete, and a test search |
| Routes | `backend/main.py`, `backend/routers/conversations.py` | HTTP endpoints, CORS, error → HTTP mapping |
| Streaming | `backend/streaming.py` | Server-Sent Events framing, saves the reply however the stream ends |
| Persistence | `backend/database.py`, `backend/models.py` | SQLAlchemy engine/sessions; `conversations`, `messages`, `documents`, `chunks` tables |
| RAG | `backend/services/rag.py` | Retrieval threshold, prompt building, tag escaping |
| Documents | `backend/routers/documents.py`, `services/chunking.py`, `services/embeddings.py`, `services/retrieval.py`, `services/documents.py` | Upload, text extraction, chunking, embeddings, similarity search |
| Schemas | `backend/schemas.py` | Pydantic request/response models and limits |
| AI service | `backend/services/openai_service.py` | SDK client, prompt, error classification |

## Project structure
```
AI-chat-application/
├── frontend/          React + TypeScript + Vite
│   └── src/ (components/, hooks/, lib/, services/, types/, test/, App.tsx, main.tsx)
├── backend/           FastAPI + Pydantic + OpenAI SDK
│   ├── main.py  schemas.py  database.py  models.py  streaming.py
│   ├── routers/conversations.py   services/openai_service.py
│   ├── tests/         pytest suite (provider mocked)
│   ├── requirements.txt  requirements-dev.txt
│   └── .env.example
└── docs/              testing guide, learning guide, interview questions
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

Optional: set `VITE_API_URL` in `frontend/.env` if the backend isn't at `http://localhost:8000`.

## API

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
The 96 tests cover validation, error mapping, safe error messages, CORS, streaming (including mid-stream failure and cancellation), conversation storage, idempotent retry, cascade deletes, document upload (text, markdown, PDF, limits, filename safety), chunking, embedding failures, similarity ranking, RAG prompt building (relevance threshold, prompt-injection escaping, citations surviving retries and document deletion), and that invalid input never reaches the model. Database tests use a throwaway SQLite file per test. See `docs/testing.md` for the manual end-to-end checklist.

### Frontend
```bash
cd frontend
npm install
npm test            # 71 tests (Vitest + Testing Library)
npm run lint && npx tsc -b && npm run build
```
The tests cover the pieces that are easy to get subtly wrong: the SSE frame parser (frames split across network reads, newlines in text, error and sources frames), citation linking (never inside code, never for a source that doesn't exist), date grouping (including the API's timezone-less UTC timestamps), the composer (Enter vs Shift+Enter, IME composition, Stop), **markdown safety** (script, image, iframe and `javascript:` payloads rendered inert), citations (open, close, chips), the confirm dialog (focus, Escape, focus trap), the sidebar, the documents panel (validation, drag and drop, delete confirmation), the theme hook, and a regression test that streamed text updates the existing DOM instead of rebuilding it.

### Continuous integration
`.github/workflows/ci.yml` runs the backend tests and the frontend lint, type-check, tests and build on every push and pull request. The tests need no API keys, network access or model download.

## Configuration and limits
| Setting | Where | Default |
|---|---|---|
| Max characters per message | `backend/schemas.py`, `frontend/src/constants.ts` | 4000 |
| Messages of context sent to the model | `backend/schemas.py` (`MAX_HISTORY_MESSAGES`) | 20 |
| Database | `DATABASE_URL` in `.env` | `sqlite:///backend/chat.db` |
| Upload limits | `backend/routers/documents.py` | 2 MB per file, 50 documents, 400 chunks per document |
| Chunking | `backend/services/chunking.py` | 800 characters per chunk, 100 overlap |
| Embeddings | `EMBEDDING_BACKEND`, `EMBEDDING_MODEL` in `.env` | `fastembed`, `BAAI/bge-small-en-v1.5` |
| Relevance threshold | `RAG_MIN_SCORE` in `.env` | `0.5` for the default model (a starting point: tune it, see below) |
| Passages per answer | `backend/services/rag.py` (`MAX_PASSAGES`) | 4 |
| Max reply tokens | `backend/services/openai_service.py` | 800 |
| Provider timeout / retries | `backend/services/openai_service.py` | 30 s / 2 |

Keep the message-length limit in `backend/schemas.py` and `frontend/src/constants.ts` in sync.
To use PostgreSQL later, set `DATABASE_URL` (for example `postgresql+psycopg://user:pass@host/db`) and install the driver; the SQLAlchemy code is unchanged.

## Security notes
- The API key lives only in `backend/.env`, which is gitignored. The frontend never sees it.
- The system prompt is set by the server; clients can send only `user` and `assistant` roles.
- Requests are size-limited to control cost and abuse.
- The server decides the model's context from its own database. A client can't inject fake turns by sending history.
- Message text is never written to the logs.
- **Rendering model output safely.** Replies are rendered as markdown with `react-markdown`, which builds React elements and never inserts raw HTML, so a reply containing `<script>`, `<img onerror=…>` or an `<iframe>` is shown as inert text. Images are dropped entirely (a remote image URL in model output would be a tracking pixel), `javascript:` links are neutralized, and external links open in a new tab with `rel="noopener noreferrer"`. All of this is covered by tests. A Content-Security-Policy header would add defense in depth when deploying.
- **Prompt injection from documents.** Retrieved text is untrusted: a document can contain "ignore your instructions". Passages are placed in the *user* turn inside a `<sources>` block (never in the system prompt), any `<sources>` tags inside them are escaped so a document can't close the block early, and the system prompt tells the model to treat the block as reference text only. This reduces the risk but cannot eliminate it: a model may still be influenced by text it reads. Don't index documents you don't trust, and never give the model tools or secrets that a document could talk it into misusing.
- Uploaded files are processed in memory and never written to disk, so there is no path-traversal or disk-filling risk from them. The filename is only a display label (directories are stripped). Size, type, document-count and chunk-count limits bound storage and compute. Note that the web framework may buffer a very large request body before the 2 MB check runs, so in production also cap request size at the reverse proxy.
- **There is no authentication yet.** Anyone who can reach the API can list, read and delete every conversation. That is fine for local use only. Before deploying, add user accounts and an ownership check on every `/conversations` route.
- CORS allows only the local dev origins. Restrict `allow_origins` further for deployment.
- If a key is ever pasted into chat, a log, or a commit, revoke it immediately and create a new one.

### Tuning the relevance threshold
Cosine scores are not probabilities and differ between models. The default `0.5` for `bge-small-en-v1.5` is a **starting guess**, not a measured value. Expand a citation to see its score, then adjust `RAG_MIN_SCORE`: too low and unrelated passages mislead the model; too high and real matches are dropped ("nothing relevant found"). Re-tune whenever you change the embedding model.

## Roadmap
- Authentication and per-user conversations and documents (required before any deployment)
- Better retrieval: rewrite follow-up questions into standalone ones before searching, hybrid keyword + vector search, re-ranking, an indexed vector store for large libraries

## Learning guide
- `docs/AI-Chat-Learning-Guide.html`: interactive walkthrough of how the app was built (Phases 1 to 9 concepts)
- `docs/AI-Chat-Flows-Guide.html`: step-by-step sequence diagrams of every end-to-end flow in the current app (startup, send, streaming, Stop, failures and Retry, database, conversations, UI states, security, testing, endpoints)
- `docs/AI-Chat-RAG-Flows-Guide.html`: the same style of guide for documents and RAG (upload and indexing, search and thresholds, answering with citations), with live labs for chunking, scoring, and prompt building
- `docs/AI-Chat-Interview-Guide.pdf`: all 49 interview questions (Phases 1 to 14), with answers and diagrams
