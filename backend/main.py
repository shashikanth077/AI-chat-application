from fastapi import FastAPI

from schemas import ChatRequest, ChatResponse

app = FastAPI(title="AI Chat API")


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
