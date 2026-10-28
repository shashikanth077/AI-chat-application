import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# Must run before the service reads os.getenv(). Loads backend/.env if present.
load_dotenv()

from database import init_db  # noqa: E402
from routers import conversations  # noqa: E402
from schemas import ChatRequest, ChatResponse  # noqa: E402
from services.openai_service import (  # noqa: E402
    ChatServiceError,
    generate_reply,
    open_reply_stream,
)
from streaming import sse_response  # noqa: E402

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_db()  # creates the tables on first run
    yield


app = FastAPI(title="AI Chat API", lifespan=lifespan)

# CORS: the browser blocks cross-origin calls unless the server opts in.
# React (localhost:5173) and FastAPI (localhost:8000) are different origins.
# Allow only our dev frontend, never "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(conversations.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Stateless endpoints from Phases 6 and 10: the client supplies the whole
# history. The chat UI now uses /conversations/{id}/messages/stream instead.
@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    try:
        reply = generate_reply(request.messages)
    except ChatServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return ChatResponse(reply=reply)


@app.post("/chat/stream")
def chat_stream(request: ChatRequest) -> StreamingResponse:
    try:
        deltas = open_reply_stream(request.messages)
    except ChatServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return sse_response(deltas)
