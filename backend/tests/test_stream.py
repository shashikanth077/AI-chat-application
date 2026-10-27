import json
from unittest.mock import MagicMock

import httpx
import openai

REQ = httpx.Request("POST", "http://test")
BODY = {"messages": [{"role": "user", "content": "hi"}]}


def chunk(text):
    return MagicMock(choices=[MagicMock(delta=MagicMock(content=text))])


class FakeStream:
    """Iterable like the SDK stream. `items` may contain exceptions to raise."""

    def __init__(self, items):
        self.items = items
        self.close = MagicMock()

    def __iter__(self):
        for item in self.items:
            if isinstance(item, Exception):
                raise item
            yield item


def events(response):
    """Parse an SSE body into [(event, data_dict), ...]."""
    out = []
    for frame in response.text.split("\n\n"):
        if not frame.strip():
            continue
        event, data = "message", {}
        for line in frame.splitlines():
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        out.append((event, data))
    return out


def test_streams_deltas_then_done(client, fake_openai):
    stream = FakeStream([
        MagicMock(choices=[]),            # usage-style chunk with no choices
        chunk(None),                      # role-only chunk with no text
        chunk("Hel"), chunk("lo\nthere"),
    ])
    fake_openai.chat.completions.create.return_value = stream
    r = client.post("/chat/stream", json=BODY)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    assert events(r) == [
        ("message", {"delta": "Hel"}),
        ("message", {"delta": "lo\nthere"}),  # newline survives JSON encoding
        ("done", {}),
    ]
    assert fake_openai.chat.completions.create.call_args.kwargs["stream"] is True
    stream.close.assert_called_once()


def test_invalid_body_is_plain_422_not_a_stream(client, fake_openai):
    r = client.post("/chat/stream", json={"messages": []})
    assert r.status_code == 422
    fake_openai.chat.completions.create.assert_not_called()


def test_error_before_first_token_is_a_normal_http_error(client, fake_openai):
    fake_openai.chat.completions.create.side_effect = openai.APITimeoutError(request=REQ)
    r = client.post("/chat/stream", json=BODY)
    assert r.status_code == 504
    assert "detail" in r.json()


def test_error_mid_stream_becomes_error_event_and_keeps_partial(client, fake_openai):
    stream = FakeStream([chunk("Par"), openai.APIConnectionError(request=REQ)])
    fake_openai.chat.completions.create.return_value = stream
    r = client.post("/chat/stream", json=BODY)
    assert r.status_code == 200  # headers were already sent
    evs = events(r)
    assert evs[0] == ("message", {"delta": "Par"})
    assert evs[-1][0] == "error"
    assert "SECRET" not in r.text
    assert ("done", {}) not in evs
    stream.close.assert_called_once()


def test_upstream_error_text_never_reaches_client(client, fake_openai):
    resp = httpx.Response(500, request=REQ)
    fake_openai.chat.completions.create.return_value = FakeStream(
        [openai.InternalServerError("SECRET-UPSTREAM-TEXT", response=resp, body=None)]
    )
    r = client.post("/chat/stream", json=BODY)
    assert events(r)[-1][0] == "error"
    assert "SECRET" not in r.text


def test_empty_stream_is_an_error_event(client, fake_openai):
    fake_openai.chat.completions.create.return_value = FakeStream([chunk(None), chunk("")])
    evs = events(client.post("/chat/stream", json=BODY))
    assert evs == [("error", {"detail": "The AI returned an empty response."})]


def test_closing_the_generator_closes_the_upstream_stream(fake_openai):
    """Simulates the client disconnecting after the first token."""
    from schemas import ChatMessage
    from services.openai_service import open_reply_stream

    stream = FakeStream([chunk("a"), chunk("b"), chunk("c")])
    fake_openai.chat.completions.create.return_value = stream
    deltas = open_reply_stream([ChatMessage(role="user", content="hi")])
    assert next(deltas) == "a"
    deltas.close()  # what happens when the response is cancelled
    stream.close.assert_called_once()
