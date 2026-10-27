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
