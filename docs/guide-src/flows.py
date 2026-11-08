# Each flow: id, title, summary, participants [(key, label, css)], steps [(src, dst, arrow label, kind, explanation, code)]
# css: bl (blue), gr (green), pu (purple), am (amber), gy (grey), rd (red)

FLOWS = [
 {
  "id": "startup", "title": "Startup: from 'run it' to 'chats on screen'",
  "summary": "The backend boots without an AI key or a model client; the browser restores the last chat from the API.",
  "parts": [("dev","Developer","gy"),("api","FastAPI (main.py)","pu"),("db","SQLite","gr"),("ui","React (browser)","bl")],
  "steps": [
   ("dev","api","uvicorn main:app","n","Uvicorn imports main.py. The module runs top to bottom, so the environment is read first.","backend/main.py"),
   ("api","api","load_dotenv + log filter","n","backend/.env is loaded before any project import that reads the environment. The log filter that masks secrets is installed.","main.py, guardrails/hardening.py"),
   ("api","api","middleware + routers","n","Security headers and the 2.5 MB body cap wrap everything. CORS allows CORS_ORIGINS (default localhost:5173). Routers are attached. The chat model is not created yet, so no key is needed to boot.","main.py, services/llm.py"),
   ("api","db","lifespan: create tables","db","init_db() runs create_all. First start creates the tables; later starts change nothing.","database.py"),
   ("api","dev","Listening on :8000","ret","The server accepts requests. /health works with no key configured.","main.py"),
   ("ui","api","GET /conversations, /info, /documents","n","The page loads. The UI asks for the chat list, the deployment facts (model, provider host, guardrail policy, vector store) and the document list.","App.tsx, services/*"),
   ("api","db","SELECT conversations, documents","db","Newest 100 conversations and all documents, read from SQLite.","routers/*"),
   ("api","ui","JSON","ret","The About dialog and the model chip use /info. It never contains a key.","schemas.py: InfoResponse"),
   ("ui","api","GET /conversations/{id}","n","The active chat id is read from localStorage, so a refresh reopens the same chat.","App.tsx: readStored(ACTIVE_KEY)"),
  ]
 },
 {
  "id": "send", "title": "Send a message with documents (RAG, streamed, guarded)",
  "summary": "The longest path: rate limit, guardrails, storage, follow-up rewrite, retrieval, citations, streaming, masking on the way out, and saving.",
  "parts": [("ui","React","bl"),("api","FastAPI","pu"),("gr","Guardrails","rd"),("db","SQLite","gr"),("vs","Vector index","am"),("llm","Model (LangChain)","gy")],
  "steps": [
   ("ui","api","POST …/messages/stream","n","Body is only the new text, a client_message_id and the documents switch. The message rate limit runs before the handler (429 with Retry-After when exceeded).","routers/conversations.py"),
   ("api","api","validate (Pydantic)","n","1 to 4000 characters, not blank; the id is 8 to 64 characters. Failure is 422 and nothing runs.","schemas.py"),
   ("api","gr","check_input(text)","n","A secret is refused: 422 with X-Guardrail: blocked, nothing stored. Personal data is masked to [REDACTED:EMAIL] and the masked text is what gets stored.","guardrails/checks.py"),
   ("api","db","INSERT user message (masked)","db","Once per client_message_id. The title is set from the first message. Committed before the model is called, so Retry is safe.","routers/conversations.py"),
   ("api","db","SELECT last 20 messages","db","The server decides the context from its own rows. A client cannot inject turns.","_recent_context"),
   ("api","llm","rewrite follow-up (documents on)","n","A follow-up such as 'and how long do they nap?' becomes a standalone search query. One small call, used only for searching.","services/rewrite.py"),
   ("llm","api","standalone query","ret","Length-checked (500 characters). Any failure falls back to the original question.","rewrite.py"),
   ("api","vs","embed query, search (top 4)","n","Embedding with fastembed (bge-small) or the offline hashing embedder. SQLite brute force, or Qdrant (which fetches 12 candidates, drops points whose document is not stored, then keeps 4). One LangChain retriever either way; the score threshold applies last.","services/vectorstore.py, retriever.py"),
   ("vs","api","passages + scores","ret","Best first. Each passage carries document id, filename, position and score.","services/retriever.py"),
   ("api","ui","event: guardrail, event: sources","n","Sent before any text. The bubble shows the masked text if anything was masked, and the citation chips appear.","streaming.py"),
   ("api","llm","chain.stream(system + <sources> + history)","n","ChatPromptTemplate | ChatOpenAI | StrOutputParser. The server's system prompt, escaped sources in the last user turn, max 800 tokens, 30 s timeout. The first piece is awaited before the response starts, so an auth or rate-limit failure is still a real HTTP status.","services/llm.py"),
   ("llm","api","tokens","ret","Text pieces stream back as the model writes them.","_text_pieces"),
   ("api","gr","guard_stream: mask output","n","Secrets and personal data the model repeats are masked. The last 96 characters are held back so a split secret is still caught.","guardrails/checks.py"),
   ("api","ui","data: {delta} … event: done","n","Each masked piece is an SSE frame. The first frame creates the bubble. done marks completion.","streaming.py, services/sse.ts"),
   ("api","db","INSERT assistant (masked) + sources","db","Saved in a new session when the stream ends, is stopped or fails. The citation snapshot is copied, so it survives a document delete.","routers/conversations.py"),
  ]
 },
 {
  "id": "upload", "title": "Upload and index a document",
  "summary": "Text is checked, masked, chunked and embedded before anything is stored. The index is written before the SQLite commit.",
  "parts": [("ui","React","bl"),("api","FastAPI","pu"),("gr","Guardrails","rd"),("emb","Embedder","gy"),("vs","Vector index","am"),("db","SQLite","gr")],
  "steps": [
   ("ui","api","POST /documents (multipart)","n","Client checks the type (.txt, .md, .pdf) and size first. Server enforces the same limits: 2 MB, 50 documents.","routers/documents.py"),
   ("api","api","extract text (in memory)","n","UTF-8 for text and markdown; pypdf for PDF. Nothing is written to disk.","services/documents.py"),
   ("api","gr","check_document(text)","n","A secret refuses the whole file (422). Personal data is masked before chunking. Instruction-like phrases add a warning only.","guardrails/checks.py"),
   ("api","api","chunk 800 chars, 100 overlap","n","Paragraph-aware packing; at most 400 chunks per document.","services/chunking.py"),
   ("api","emb","embed_documents(chunks)","n","Unit-length vectors (384 floats for bge-small). The first call may download the model once.","services/embeddings.py"),
   ("api","vs","write points (Qdrant only)","n","Deterministic point ids. One collection per embedding model. SQLite backend: no-op, because the rows are written in the same transaction.","services/vectorstore.py, qdrant_store.py"),
   ("api","db","INSERT document + chunks","db","Chunk text and the vector bytes are stored together, then committed.","models.py"),
   ("db","api","commit failed?","err","If the commit fails, the new points are deleted again (best effort). Search also ignores any leftover points.","routers/documents.py"),
   ("api","ui","201 {id, chunk_count, redacted, warnings}","ret","The panel says what was masked, and any warnings. Only the upload response carries those notes.","schemas.py"),
  ]
 },
 {
  "id": "stop", "title": "Stop, failures and Retry",
  "summary": "Stop keeps the partial answer and closes the provider connection. A failure before the first token is a real HTTP error. Retry re-sends the same id, so nothing is duplicated.",
  "parts": [("ui","React","bl"),("api","FastAPI","pu"),("llm","Model provider","gy"),("db","SQLite","gr")],
  "steps": [
   ("ui","api","stream open","n","Tokens are arriving and the bubble grows.","App.tsx: requestReply"),
   ("llm","api","tokens","ret","Pieces stream in.","llm.py"),
   ("ui","api","Stop: connection closed","n","AbortError is recognised; it is not an error. Starlette raises GeneratorExit in the response generator.","streaming.py"),
   ("api","llm","close upstream stream","err","The guard's finally closes the chain's stream, which closes the HTTP connection. No more tokens are generated or billed for text nobody will read.","guardrails/checks.py"),
   ("api","db","save partial (masked)","db","The masked partial text is stored in a new session. A refresh shows exactly what was on screen.","streaming.py finally"),
   ("ui","api","Retry: same client_message_id","n","Failure before the first token: the status is real (504, 502, 429 or 500) and the UI shows an error with Retry.","services/llm.py: _translate"),
   ("api","db","find id → delete later rows","db","The stored user message is found, so no second copy. Whatever followed it (the partial answer) is deleted.","routers/conversations.py"),
   ("api","ui","fresh streamed answer","ret","Exactly one user message and one answer afterwards.","test_conversations.py"),
  ]
 },
 {
  "id": "delete", "title": "Delete a conversation or a document",
  "summary": "SQLite is committed first; index entries are removed afterwards and are never returned even if that step fails.",
  "parts": [("ui","React","bl"),("api","FastAPI","pu"),("db","SQLite","gr"),("vs","Vector index","am")],
  "steps": [
   ("ui","ui","confirm dialog","n","Accessible modal (focus trap, Escape). Nothing is sent until the user confirms.","components/ConfirmDialog.tsx"),
   ("ui","api","DELETE /conversations/{id}","n","Also used by the cleanup of a chat created by a refused message.","routers/conversations.py"),
   ("api","db","DELETE (cascade)","db","Messages and their citation snapshots go with the chat, by ORM cascade and by foreign key.","models.py"),
   ("api","ui","204 No Content","ret","The list refreshes. Other chats are untouched.","App.tsx"),
   ("ui","api","DELETE /documents/{id}","n","Deleting a document removes its chunks in SQLite.","routers/documents.py"),
   ("api","db","commit document delete","db","The source of truth changes first.","routers/documents.py"),
   ("api","vs","delete points (best effort)","n","If this fails the response is still 204. Search hides the leftovers; reindex_qdrant.py --prune removes them.","services/vectorstore.py"),
  ]
 },
 {
  "id": "demo", "title": "Demo mode: the same app with no server",
  "summary": "The public GitHub Pages build answers its own API calls in the browser, with simulated replies and no key, no shared database and no backend.",
  "parts": [("vis","Visitor","gy"),("pg","GitHub Pages","gy"),("ui","React (VITE_DEMO)","bl"),("dm","Demo API (browser)","pu"),("ls","localStorage","gr")],
  "steps": [
   ("vis","pg","open the project link","n","A static build of the frontend is served. Nothing dynamic runs on GitHub's side.","deploy-demo.yml"),
   ("pg","ui","index.html + JS bundle","ret","Built with VITE_DEMO=true and VITE_BASE set to the repository path.","vite.config.ts"),
   ("ui","dm","fetchOrThrow → demoFetch","n","The same services and SSE parser run. Only the transport is swapped (dynamic import, so the demo code is not in the main bundle).","services/http.ts"),
   ("dm","ls","read/write chats and uploads","db","All state is in this browser. Nothing is sent to a server.","demo/store.ts"),
   ("dm","dm","guardrails (TypeScript port)","n","Refuses secrets and masks personal data, tested against the Python detectors on a shared fixture.","demo/guardrails.ts"),
   ("dm","dm","retrieve + simulated reply","n","Client-side RAG: the chunking and hashing embedder are ports, tested for parity. The answer is composed from the passages and streamed word by word.","demo/rag.ts, assistant.ts"),
   ("dm","ui","SSE frames: sources, guardrail, delta, done","ret","Streamed exactly like the real server, so the UI code path is the same.","demo/api.ts"),
  ]
 },
 {
  "id": "delivery", "title": "Delivery: from a commit to running software",
  "summary": "Pushes and pull requests run the checks. A push to main publishes the demo. The full stack is deployed by you, with the key and vector store configured on the host.",
  "parts": [("dev","Developer","gy"),("gh","GitHub","gy"),("ci","Actions: ci.yml","am"),("pg","Actions: deploy-demo","am"),("host","Your host (optional)","pu")],
  "steps": [
   ("dev","gh","git push / pull request","n","Any branch and any pull request.","GitHub"),
   ("gh","ci","ci.yml","n","Backend: pip install, pytest (206). Frontend: npm ci, lint, tsc, vitest (172), build.","ci.yml"),
   ("ci","gh","status checks","ret","Pass or fail on the commit. The tests need no keys, network or model download.","ci.yml"),
   ("gh","pg","push to main → deploy-demo.yml","n","Build with VITE_DEMO=true, then upload the Pages artifact and deploy it.","deploy-demo.yml"),
   ("dev","host","docker compose up -d qdrant","n","The optional Qdrant server, bound to 127.0.0.1 and protected by QDRANT_API_KEY.","docker-compose.yml"),
   ("dev","host","uvicorn main:app behind TLS","n","Set CORS_ORIGINS to the frontend origin, VECTOR_STORE, provider key, and TRUST_PROXY only behind your proxy.","docs/DEPLOY.md"),
   ("dev","host","static frontend with VITE_API_URL","n","The frontend build points at the API. Public variables only, never secrets.","frontend/.env"),
  ]
 },
]
