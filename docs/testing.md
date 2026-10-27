# Testing and troubleshooting

## Automated backend tests
```bash
cd backend && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```
The OpenAI client is mocked, so tests are free, offline and deterministic.

## Manual end-to-end checklist (real provider)
1. Start backend (`uvicorn main:app --reload --port 8000`) and frontend (`npm run dev`).
2. `GET http://localhost:8000/health` returns `{"status":"ok"}`.
3. Send "Say hi in five words": a real reply appears.
4. Send "My name is Sam", then "What is my name?": the reply says Sam (context works).
5. Stop the backend, send a message: "Cannot reach the server" + Retry; restart and Retry works.
6. Wrong key / wrong model in `.env` (restart): safe error text, details only in the server log.
7. Paste >4000 characters: input stops at 4000.
8. Clear Chat resets messages and errors.
9. Narrow the window below 600px: no horizontal scroll.

## Troubleshooting
| Symptom | Likely cause | Fix |
|---|---|---|
| "blocked by CORS policy" | Origin not allowed | Add the exact origin to `allow_origins` in `main.py` |
| "Cannot reach the server" | Backend down / wrong port / `VITE_API_URL` | Check terminal 1 and `/health` |
| "The server is not configured correctly." | Missing/invalid key or model; `.env` not in `backend/`; no restart | Fix `.env`, restart Uvicorn; read the server log |
| Key valid but always that message (non-OpenAI provider) | `OPENAI_BASE_URL` not set | Set it, e.g. `https://api.groq.com/openai/v1` |
| 502 "AI service returned an error" | Model name invalid for the provider | Check the provider's model list; log shows the status |
| 429 | Rate limit / quota | Wait, or check the provider dashboard |
| 422 | Request violates the schema | Open devtools -> Network -> response `detail` |
| `ModuleNotFoundError` | venv not active or wrong cwd | `source .venv/bin/activate`; run from `backend/` |

## Persistence checklist (Phase 11)
1. Send "My name is Sam", then "What is my name?": the second reply uses the first (context is loaded from the database).
2. Refresh the page: the same conversation reopens with both messages. The sidebar shows it, highlighted.
3. Stop and restart Uvicorn, then refresh: the chats are still there (`backend/chat.db`).
4. **+ New chat**, send a message: a second entry appears at the top of the sidebar. Click the first to switch back.
5. Press **Stop** mid-answer, then refresh: the partial answer is still saved.
6. Stop the provider/network mid-answer: you get an error and **Retry**; after Retry, `GET /conversations/{id}` shows one user message, not two.
7. **Clear Chat** (or the × in the sidebar) deletes the chat after a confirmation.
8. Narrow the window below 700px: the sidebar becomes a drawer opened by the ☰ button.
9. Inspect the data directly: `sqlite3 backend/chat.db "select id, title from conversations;"`

| Symptom | Likely cause | Fix |
|---|---|---|
| `sqlite3.OperationalError: unable to open database file` | The folder isn't writable or `DATABASE_URL` is wrong | Check the path |
| `database is locked` | Two processes writing at once | Run one backend instance; SQLite handles concurrent reads but serialises writes |
| Old chats missing after changing `DATABASE_URL` | You are looking at a different database file | Point back to the original URL |
| Table errors after changing a model | `create_all` never alters existing tables | Delete `chat.db` in development, or adopt Alembic migrations |
