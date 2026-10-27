from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from schemas import ChatRequest, ChatResponse

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


# FastAPI sees the `ChatRequest` type hint on `request`, so it reads the JSON
# body, validates it, and only then calls this function. Invalid input never
# reaches our code: FastAPI replies 422 automatically.
@app.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest) -> ChatResponse:
    last = request.messages[-1].content
    return ChatResponse(
        reply=f"(hardcoded) Got {len(request.messages)} message(s). Last: {last!r}"
    )
