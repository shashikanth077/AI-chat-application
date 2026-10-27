# AI Chat Application

A full-stack AI chat app: a React + TypeScript frontend talks to a FastAPI backend, which calls an
OpenAI-compatible chat model (OpenAI, or Groq via a base URL). Built as a learning portfolio project.

## Features
- Chat UI with user/assistant bubbles, auto-scroll, and a typing indicator
- Enter to send, Shift+Enter for a new line
- Streaming replies: text appears as it is generated, with a Stop button
- Conversation context: follow-up questions work (the last 20 messages are sent)
- Clear Chat, error messages with a Retry button
- Input limits (4000 characters per message) shown with a live counter
- Responsive layout for desktop and mobile
- Server-side validation with Pydantic; safe, mapped HTTP errors
- API key kept on the backend and never logged or sent to the browser
- Automated backend tests (pytest) with the provider mocked

## Architecture

```
React UI → fetch → FastAPI (POST /chat) → Pydantic validation → OpenAI SDK → model
                                     ←──── JSON {"reply"} ←──── reply text ←──┘
```

| Layer | Location | Responsibility |
|---|---|---|
| UI components | `frontend/src/components/` | Presentational pieces (input, list, bubble) |
| App state | `frontend/src/App.tsx` | Messages, loading, error, send/retry/clear |
| API client | `frontend/src/services/chatService.ts` | `fetch` to the backend, error normalization |
| Routes | `backend/main.py` | HTTP endpoints, CORS, error → HTTP mapping |
| Schemas | `backend/schemas.py` | Pydantic request/response models and limits |
| AI service | `backend/services/openai_service.py` | SDK client, prompt, error classification |

## Project structure
```
AI-chat-application/
├── frontend/          React + TypeScript + Vite
│   └── src/ (components/, services/, types/, App.tsx, main.tsx)
├── backend/           FastAPI + Pydantic + OpenAI SDK
│   ├── main.py  schemas.py  services/openai_service.py
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

### `POST /chat/stream`
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
The 25 tests cover validation, error mapping, safe error messages, CORS, streaming (including mid-stream failure and cancellation), and that invalid input never reaches the model. See `docs/testing.md` for the manual end-to-end checklist.

## Configuration and limits
| Setting | Where | Default |
|---|---|---|
| Max characters per message | `backend/schemas.py`, `frontend/src/constants.ts` | 4000 |
| Max messages per request | `backend/schemas.py`, `frontend/src/constants.ts` | 20 |
| Max reply tokens | `backend/services/openai_service.py` | 800 |
| Provider timeout / retries | `backend/services/openai_service.py` | 30 s / 2 |

Keep the two limit files in sync when changing them.

## Security notes
- The API key lives only in `backend/.env`, which is gitignored. The frontend never sees it.
- The system prompt is set by the server; clients can send only `user` and `assistant` roles.
- Requests are size-limited to control cost and abuse.
- CORS allows only the local dev origins. Restrict `allow_origins` further for deployment.
- If a key is ever pasted into chat, a log, or a commit, revoke it immediately and create a new one.

## Roadmap
- Retrieval-augmented generation (RAG) over user documents (planned next phase)
- Persistent conversations (SQLite, planned next)

## Learning guide
- `docs/AI-Chat-Learning-Guide.html`: interactive walkthrough of how the app was built
- `docs/AI-Chat-Interview-Guide.pdf`: all interview questions, with answers and diagrams
