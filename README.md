# AI Chat Application

A full-stack AI chat app: a React + TypeScript frontend talks to a FastAPI backend, which calls an
OpenAI-compatible chat model (OpenAI, or Groq via a base URL). Built as a learning portfolio project.

## Features
- Chat UI with user/assistant bubbles, auto-scroll, and a typing indicator
- Enter to send, Shift+Enter for a new line
- Streaming replies: text appears as it is generated, with a Stop button
- Document library: upload `.txt`, `.md` or `.pdf`; files are split into chunks, embedded locally, and searchable (retrieval groundwork for RAG)
- Saved conversations (SQLite): a sidebar of past chats that survives refreshes and server restarts
- Conversation context: follow-up questions work; the server loads the last 20 stored messages itself
- Clear Chat (deletes the open conversation), error messages with a safe, duplicate-free Retry
- Input limits (4000 characters per message) shown with a live counter
- Responsive layout for desktop and mobile
- Server-side validation with Pydantic; safe, mapped HTTP errors
- API key kept on the backend and never logged or sent to the browser
- Automated backend tests (pytest) with the provider mocked

## Architecture

```
React UI → fetch → FastAPI (POST /conversations/{id}/messages/stream)
                      → Pydantic validation → SQLite (store message, load last 20)
                      → OpenAI SDK → model
        ←── SSE text pieces ←── (assistant reply saved when the stream ends) ←──┘
```

| Layer | Location | Responsibility |
|---|---|---|
| UI components | `frontend/src/components/` | Presentational pieces (input, list, bubble) |
| App state | `frontend/src/App.tsx` | Messages, loading, error, send/retry/clear |
| API client | `frontend/src/services/` | `chatService.ts` (stream reader), `conversationService.ts` (CRUD), `http.ts` (errors) |
| Sidebar | `frontend/src/components/Sidebar.tsx` | Saved chats, New chat, delete |
| Documents panel | `frontend/src/components/DocumentsPanel.tsx` | Upload, list, delete, and a test search |
| Routes | `backend/main.py`, `backend/routers/conversations.py` | HTTP endpoints, CORS, error → HTTP mapping |
| Streaming | `backend/streaming.py` | Server-Sent Events framing, saves the reply however the stream ends |
| Persistence | `backend/database.py`, `backend/models.py` | SQLAlchemy engine/sessions; `conversations`, `messages`, `documents`, `chunks` tables |
| Documents / RAG | `backend/routers/documents.py`, `services/chunking.py`, `services/embeddings.py`, `services/retrieval.py`, `services/documents.py` | Upload, text extraction, chunking, embeddings, similarity search |
| Schemas | `backend/schemas.py` | Pydantic request/response models and limits |
| AI service | `backend/services/openai_service.py` | SDK client, prompt, error classification |

## Project structure
```
AI-chat-application/
├── frontend/          React + TypeScript + Vite
│   └── src/ (components/, services/, types/, App.tsx, main.tsx)
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

Embeddings: the default is a small local model (`BAAI/bge-small-en-v1.5`, about 130 MB), downloaded once on the first upload or search into `backend/.model_cache/` and then fully offline. Chat can use Groq while embeddings stay local, because Groq has no embeddings API. `EMBEDDING_BACKEND=hashing` selects a built-in offline word-matching embedder for tests and development: it matches shared words, **not meaning**.

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
```bash
cd backend
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```
The 81 tests cover validation, error mapping, safe error messages, CORS, streaming (including mid-stream failure and cancellation), conversation storage, idempotent retry, cascade deletes, document upload (text, markdown, PDF, limits, filename safety), chunking, embedding failures, similarity ranking, and that invalid input never reaches the model. Database tests use a throwaway SQLite file per test. See `docs/testing.md` for the manual end-to-end checklist.

## Configuration and limits
| Setting | Where | Default |
|---|---|---|
| Max characters per message | `backend/schemas.py`, `frontend/src/constants.ts` | 4000 |
| Messages of context sent to the model | `backend/schemas.py` (`MAX_HISTORY_MESSAGES`) | 20 |
| Database | `DATABASE_URL` in `.env` | `sqlite:///backend/chat.db` |
| Upload limits | `backend/routers/documents.py` | 2 MB per file, 50 documents, 400 chunks per document |
| Chunking | `backend/services/chunking.py` | 800 characters per chunk, 100 overlap |
| Embeddings | `EMBEDDING_BACKEND`, `EMBEDDING_MODEL` in `.env` | `fastembed`, `BAAI/bge-small-en-v1.5` |
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
- Uploaded files are processed in memory and never written to disk, so there is no path-traversal or disk-filling risk from them. The filename is only a display label (directories are stripped). Size, type, document-count and chunk-count limits bound storage and compute. Note that the web framework may buffer a very large request body before the 2 MB check runs, so in production also cap request size at the reverse proxy.
- **There is no authentication yet.** Anyone who can reach the API can list, read and delete every conversation. That is fine for local use only. Before deploying, add user accounts and an ownership check on every `/conversations` route.
- CORS allows only the local dev origins. Restrict `allow_origins` further for deployment.
- If a key is ever pasted into chat, a log, or a commit, revoke it immediately and create a new one.

## Roadmap
- Authentication and per-user conversations and documents (required before any deployment)
- RAG answers: retrieve chunks for each question, answer from them, and cite sources (Phase 13, next)

## Learning guide
- `docs/AI-Chat-Learning-Guide.html`: interactive walkthrough of how the app was built (Phases 1 to 9 concepts)
- `docs/AI-Chat-Flows-Guide.html`: step-by-step sequence diagrams of every end-to-end flow in the current app (startup, send, streaming, Stop, failures and Retry, database, conversations, UI states, security, testing, endpoints)
- `docs/AI-Chat-Interview-Guide.pdf`: all interview questions, with answers and diagrams
