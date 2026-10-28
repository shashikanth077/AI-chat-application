# Interview questions (collected per phase; compiled into the final PDF)

## Phase 1
1. Why must the OpenAI call go through a backend instead of the browser?
2. What is a Python virtual environment, and what is the Node equivalent?
3. What does `uvicorn main:app` mean; how do FastAPI and Uvicorn relate?

## Phase 2
1. Why compute the new array first instead of calling setMessages then reading `messages`?
2. Why separate chatService.ts from components?
3. How do you prevent a double submit while a request is in flight?

## Phase 3
1. Why does GET /chat return 405 instead of 404?
2. When use `def` vs `async def` in FastAPI?
3. How does FastAPI generate /docs without documentation code?

## Phase 4
1. How does a JSON body become a Python object in FastAPI?
2. Why validate on the backend when the frontend already validates?
3. Why `Literal["user","assistant"]` for role, and why reject "system"?

## Phase 5
1. What is CORS, who enforces it, and what is a preflight request?
2. Why does fetch not reject on HTTP 4xx/5xx, and how do you handle that?
3. Why not use allow_origins=["*"], and how would you configure this for production?

## Phase 6
1. Why keep the API key on the server, and how do environment variables / .env / .gitignore work together?
2. What is a system prompt (instructions) versus user/assistant messages, and why must the server own it?
3. How do you handle OpenAI failures (timeout, rate limit, auth) without leaking internals, and which HTTP status codes do you map them to?

## Phase 7
1. Why trim conversation history before sending, and what are the trade-offs (context loss vs. cost/limits)?
2. Why does the chat UI keep the user message after a failed request, and how does Retry avoid duplicates?
3. Why must input limits exist on both frontend and backend, and which one is the real security boundary?

## Phase 8
1. How do you unit-test code that calls an external API, and what should and should not be mocked?
2. Why use the Chat Completions format with a configurable base URL, and what does that buy you?
3. How would you debug a request that works in Swagger but fails in the browser?

## Phase 10
1. Why Server-Sent Events instead of WebSockets for streaming a chat reply, and when would you pick WebSockets?
2. Once a streaming response has started with HTTP 200, how do you report a later failure, and what must the client do if the stream ends without a "done" event?
3. What happens when the user clicks Stop or closes the tab, and how do you make sure the server stops paying for tokens nobody will read?

## Phase 11
1. Why should the server, not the client, own the conversation history, and what attacks or bugs does that prevent?
2. How does sending a client-generated message id make retry safe (idempotent), and what would go wrong with a naive retry that just re-posts the message?
3. Why SQLite for development with SQLAlchemy, what changes when you move to PostgreSQL, and what is missing before you could deploy this (authentication, ownership checks, migrations)?

## Phase 12
1. What is RAG and why does it exist? What problem does it solve that a bigger prompt or fine-tuning does not?
2. How does chunking affect retrieval quality? Explain the trade-offs of chunk size and overlap.
3. What is an embedding, why do we normalize vectors, and why is cosine similarity then just a dot product?
4. Why does top-k search always return k results even when nothing is relevant, and how do you handle that?
5. Why must documents be re-embedded if you change the embedding model, and how does this app protect against mixing them?

## Phase 13
1. Walk through what happens, step by step, when a user asks a question with RAG enabled. Where can quality be lost?
2. What is prompt injection, why is retrieved text especially exposed to it, and what did this app do (and not do) about it?
3. How do you choose a relevance threshold, and what goes wrong when it is too low or too high? How would you evaluate retrieval quality properly?
4. Why store citations as a snapshot instead of a reference to the document, and what are the trade-offs?
5. Why does a follow-up like "what about its price?" retrieve poorly, and how would you fix it (query rewriting, using conversation context)?

## Phase 14
1. How do you render a model's markdown output without opening an XSS hole, and what does this app do beyond the library's defaults?
2. A test showed every streamed token (and every citation click) rebuilt the whole rendered markdown. Why did that happen, and how was it fixed?
3. Why is "always scroll to the bottom" bad chat UX, and how does the stick-to-bottom approach work?
4. What does an accessible custom confirm dialog need, and why replace `window.confirm`?
5. What did you test at each level of the frontend (unit, component, end-to-end), and what does each level catch that the others miss?
6. The API returns timestamps without a timezone. What goes wrong in the browser, and how is it handled?
