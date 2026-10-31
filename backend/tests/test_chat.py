import httpx
import openai
import pytest

from services import llm
from helpers import completion

USER_HI = {"messages": [{"role": "user", "content": "hi"}]}
REQ = httpx.Request("POST", "http://test")


def _resp(status: int) -> httpx.Response:
    return httpx.Response(status, request=REQ)


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_success_trims_reply_and_prepends_system_prompt(client, fake_openai):
    r = client.post("/chat", json={"messages": [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
        {"role": "user", "content": "how are you"},
    ]})
    assert r.status_code == 200
    assert r.json() == {"reply": "Hello!"}
    sent = fake_openai.chat.completions.create.call_args.kwargs
    assert sent["model"] == "test-model"
    assert sent["messages"][0]["role"] == "system"
    assert [m["role"] for m in sent["messages"][1:]] == ["user", "assistant", "user"]


@pytest.mark.parametrize("body", [
    {"messages": []},
    {"messages": [{"role": "system", "content": "x"}]},
    {"messages": [{"role": "user", "content": "   "}]},
    {"messages": [{"role": "user", "content": "x" * 4001}]},
    {"messages": [{"role": "assistant", "content": "x"}]},
    {"messages": [{"role": "user", "content": "x"}] * 21},
    {"msgs": 1},
])
def test_invalid_bodies_return_422_and_never_call_openai(client, fake_openai, body):
    assert client.post("/chat", json=body).status_code == 422
    fake_openai.chat.completions.create.assert_not_called()


def test_non_json_body_is_422(client, fake_openai):
    r = client.post("/chat", content="not json", headers={"Content-Type": "application/json"})
    assert r.status_code == 422


@pytest.mark.parametrize("error, status", [
    (openai.APITimeoutError(request=REQ), 504),
    (openai.APIConnectionError(request=REQ), 502),
    (openai.RateLimitError("SECRET-UPSTREAM-TEXT", response=_resp(429), body=None), 429),
    (openai.AuthenticationError("SECRET-UPSTREAM-TEXT", response=_resp(401), body=None), 500),
    (openai.InternalServerError("SECRET-UPSTREAM-TEXT", response=_resp(500), body=None), 502),
])
def test_openai_errors_map_to_safe_http_errors(client, fake_openai, error, status):
    fake_openai.chat.completions.create.side_effect = error
    r = client.post("/chat", json=USER_HI)
    assert r.status_code == status
    # The upstream message must never reach the client.
    assert "SECRET" not in r.json()["detail"]


def test_missing_config_is_a_safe_500(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    monkeypatch.setattr(llm, "_model", None)
    r = client.post("/chat", json=USER_HI)
    assert r.status_code == 500
    assert r.json()["detail"] == "The server is not configured correctly."


def test_empty_model_reply_is_502(client, fake_openai):
    fake_openai.chat.completions.create.return_value = completion("  ")
    assert client.post("/chat", json=USER_HI).status_code == 502


def test_cors_allows_dev_frontend_only(client):
    ok = client.options("/chat", headers={
        "Origin": "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert ok.headers["access-control-allow-origin"] == "http://localhost:5173"
    bad = client.options("/chat", headers={
        "Origin": "http://evil.com",
        "Access-Control-Request-Method": "POST",
    })
    assert "access-control-allow-origin" not in bad.headers
