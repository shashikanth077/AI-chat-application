import logging

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Must run before the service reads os.getenv(). Loads backend/.env if present.
load_dotenv()

from schemas import ChatRequest, ChatResponse  # noqa: E402
from services.openai_service import ChatServiceError, generate_reply  # noqa: E402

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
