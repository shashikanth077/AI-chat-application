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
