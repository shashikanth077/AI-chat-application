import main
from main import cors_origins


# ---------- CORS configuration ----------

def test_cors_defaults_to_the_local_dev_origins(monkeypatch):
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    assert cors_origins() == ["http://localhost:5173", "http://127.0.0.1:5173"]


def test_cors_origins_come_from_the_environment_and_are_cleaned(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", " https://me.github.io/ , https://chat.example.com ,, ")
    assert cors_origins() == ["https://me.github.io", "https://chat.example.com"]  # trimmed, no trailing slash, no blanks


def test_cors_blank_value_falls_back_to_the_defaults(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "  ,  ")
    assert cors_origins() == main.DEV_ORIGINS


def test_a_wildcard_origin_is_allowed_but_warned_about(monkeypatch, caplog):
    monkeypatch.setenv("CORS_ORIGINS", "*")
    with caplog.at_level("WARNING"):
        assert cors_origins() == ["*"]
    assert "any website can call this API" in caplog.text


# ---------- /info ----------

def test_info_reports_the_deployment_without_any_secret(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-super-secret-value")
    monkeypatch.setenv("OPENAI_MODEL", "llama-3.3-70b")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://api.groq.com/openai/v1")
    monkeypatch.setenv("EMBEDDING_BACKEND", "fastembed")
    monkeypatch.delenv("EMBEDDING_MODEL", raising=False)
    body = client.get("/info").json()
    assert body["model"] == "llama-3.3-70b"
    assert body["provider"] == "api.groq.com"  # host only
    assert body["embedding_model"] == "BAAI/bge-small-en-v1.5"
    assert body["demo"] is False and body["app"] == "AI Chat"
    assert body["limits"] == {"max_message_chars": 4000, "history_messages": 20, "max_upload_bytes": 2_000_000, "max_documents": 50}
    text = client.get("/info").text
    assert "sk-super-secret-value" not in text and "/openai/v1" not in text


def test_info_handles_an_unconfigured_server(client, monkeypatch):
    for name in ("OPENAI_MODEL", "OPENAI_BASE_URL", "EMBEDDING_MODEL"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("EMBEDDING_BACKEND", "hashing")
    body = client.get("/info").json()
    assert body["model"] is None
    assert body["provider"] == "api.openai.com"  # the SDK default
    assert body["embedding_model"] == "hashing"


# ---------- client_id exposed so the UI can regenerate after a refresh ----------

def test_stored_user_messages_expose_the_client_id_for_retry(client, db, fake_openai):
    from helpers import FakeStream, chunk

    cid = client.post("/conversations").json()["id"]
    fake_openai.chat.completions.create.return_value = FakeStream([chunk("ok")])
    client.post(f"/conversations/{cid}/messages/stream", json={"content": "hi", "client_message_id": "msg-abcdef01"})
    user, assistant = client.get(f"/conversations/{cid}").json()["messages"]
    assert user["client_id"] == "msg-abcdef01" and assistant["client_id"] is None

    # ...and re-sending that id regenerates the answer instead of duplicating the message
    fake_openai.chat.completions.create.return_value = FakeStream([chunk("second answer")])
    client.post(f"/conversations/{cid}/messages/stream", json={"content": "hi", "client_message_id": user["client_id"]})
    messages = client.get(f"/conversations/{cid}").json()["messages"]
    assert [(m["role"], m["content"]) for m in messages] == [("user", "hi"), ("assistant", "second answer")]
