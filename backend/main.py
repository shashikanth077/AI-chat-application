import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from urllib.parse import urlparse

# Must run before the service reads os.getenv(). Loads backend/.env if present.
load_dotenv()

from database import init_db  # noqa: E402
from routers import conversations, documents  # noqa: E402
from schemas import (  # noqa: E402
    MAX_HISTORY_MESSAGES,
    MAX_MESSAGE_CHARS,
    ChatRequest,
    ChatResponse,
    InfoLimits,
    InfoResponse,
)
from services.llm import (  # noqa: E402
    ChatServiceError,
    generate_reply,
    open_reply_stream,
)
from routers.documents import MAX_DOCUMENTS, MAX_UPLOAD_BYTES  # noqa: E402
from services.embeddings import DEFAULT_MODEL as DEFAULT_EMBEDDING_MODEL  # noqa: E402
from streaming import sse_response  # noqa: E402

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

APP_VERSION = "1.0.0"
DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]


def cors_origins() -> list[str]:
    """Browser origins allowed to call this API.

    Set CORS_ORIGINS (comma-separated) to your deployed frontend, for example
    "https://you.github.io,https://chat.example.com". Defaults to the local dev server.
    """
    configured = [o.strip().rstrip("/") for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
    if "*" in configured:
        logger.warning("CORS_ORIGINS contains '*': any website can call this API from a visitor's browser")
    return configured or DEV_ORIGINS


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_db()  # creates the tables on first run
    yield


app = FastAPI(title="AI Chat API", lifespan=lifespan)

# CORS: the browser blocks cross-origin calls unless the server opts in.
# React (localhost:5173) and FastAPI (localhost:8000) are different origins.
# Allow only known frontends (CORS_ORIGINS), never "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins(),
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(conversations.router)
app.include_router(documents.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/info", response_model=InfoResponse)
def info() -> InfoResponse:
    """Non-secret facts about this deployment for the UI header and About dialog."""
    base_url = os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1"
    backend = os.getenv("EMBEDDING_BACKEND", "fastembed")
    return InfoResponse(
        app="AI Chat",
        version=APP_VERSION,
        demo=False,
        model=os.getenv("OPENAI_MODEL") or None,
        provider=urlparse(base_url).hostname,  # the host only: never the key, never the full URL
        embedding_backend=backend,
        embedding_model="hashing" if backend == "hashing" else (os.getenv("EMBEDDING_MODEL") or DEFAULT_EMBEDDING_MODEL),
        limits=InfoLimits(
            max_message_chars=MAX_MESSAGE_CHARS,
            history_messages=MAX_HISTORY_MESSAGES,
            max_upload_bytes=MAX_UPLOAD_BYTES,
            max_documents=MAX_DOCUMENTS,
        ),
    )


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
