from fastapi import FastAPI

app = FastAPI(title="AI Chat API")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
