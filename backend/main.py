import json
import logging

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# Must run before the service reads os.getenv(). Loads backend/.env if present.
load_dotenv()

from schemas import ChatRequest, ChatResponse  # noqa: E402
from services.openai_service import (  # noqa: E402
    ChatServiceError,
    generate_reply,
    open_reply_stream,
)

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="AI Chat API")

# CORS: the browser blocks cross-origin calls unless the server opts in.
# React (localhost:5173) and FastAPI (localhost:8000) are different origins.
# Allow only our dev frontend, never "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    try:
        reply = generate_reply(request.messages)
    except ChatServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    return ChatResponse(reply=reply)


def _sse(data: dict[str, str], event: str | None = None) -> str:
    """Format one Server-Sent Event. JSON keeps newlines in the text safe."""
    prefix = f"event: {event}\n" if event else ""
    return f"{prefix}data: {json.dumps(data)}\n\n"


@app.post("/chat/stream")
def chat_stream(request: ChatRequest) -> StreamingResponse:
    # Errors before the first token still become normal HTTP errors.
    try:
        deltas = open_reply_stream(request.messages)
    except ChatServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    def events():
        # Once streaming starts the status is already 200, so a failure now
        # can only be reported as an in-stream "error" event.
        try:
            for text in deltas:
                yield _sse({"delta": text})
            yield _sse({}, event="done")
        except ChatServiceError as exc:
            yield _sse({"detail": exc.message}, event="error")
        finally:
            deltas.close()  # stop the upstream request if the client left

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
