from fastapi import FastAPI

app = FastAPI(title="AI Chat API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# Phase 3: temporary hardcoded endpoint. It ignores the request body for now;
# Phase 4 adds Pydantic models so the body is parsed and validated.
@app.post("/chat")
def chat() -> dict[str, str]:
    return {"reply": "Hello from FastAPI! (hardcoded response)"}
