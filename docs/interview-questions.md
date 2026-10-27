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
