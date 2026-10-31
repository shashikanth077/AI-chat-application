"""Follow-up questions are rewritten into standalone search queries (services/rewrite.py)."""
import httpx
import openai
import pytest
from helpers import FakeStream, chunk, completion, events
from test_documents import CATS, SPACE, upload

REQ = httpx.Request("POST", "http://test")


def raw_create(fake_openai):
    """The mock behind the NON-streaming call, which is what the rewriter uses."""
    return fake_openai.chat.completions.with_raw_response.create


def rewriter_says(fake_openai, text):
    raw_create(fake_openai).side_effect = lambda **kw: type("R", (), {"parse": lambda self: completion(text)})()


def ask(client, cid, content, mid):
    return client.post(
        f"/conversations/{cid}/messages/stream",
        json={"content": content, "client_message_id": mid, "use_documents": True},
    )


@pytest.fixture
def chat(client, rag, fake_openai):
    """A conversation about cats that already has one answered turn."""
    upload(client, "cats.txt", CATS)
    upload(client, "space.txt", SPACE)
    cid = client.post("/conversations").json()["id"]
    fake_openai.chat.completions.create.return_value = FakeStream([chunk("Cats are mammals.")])
    ask(client, cid, "tell me about cats", "msg-00000001")
    fake_openai.chat.completions.create.return_value = FakeStream([chunk("Most of the day [1].")])
    raw_create(fake_openai).reset_mock()
    return cid


def test_the_first_question_is_searched_as_is_with_no_extra_model_call(client, rag, fake_openai):
    upload(client, "cats.txt", CATS)
    cid = client.post("/conversations").json()["id"]
    fake_openai.chat.completions.create.return_value = FakeStream([chunk("ok")])
    ask(client, cid, "how much do cats sleep", "msg-00000001")
    raw_create(fake_openai).assert_not_called()


def test_a_vague_follow_up_finds_the_right_document_through_the_rewrite(client, chat, fake_openai):
    rewriter_says(fake_openai, "how much do cats sleep")
    sources = events(ask(client, chat, "and how long do they nap?", "msg-00000002"))[0][1]["sources"]
    assert sources[0]["filename"] == "cats.txt"


def test_without_the_rewrite_the_same_follow_up_finds_nothing(client, chat, fake_openai, monkeypatch):
    monkeypatch.setenv("RAG_REWRITE_QUERIES", "false")
    evs = events(ask(client, chat, "and how long do they nap?", "msg-00000002"))
    assert evs[0] == ("sources", {"sources": []})
    raw_create(fake_openai).assert_not_called()


def test_the_model_still_receives_the_users_real_question(client, chat, fake_openai):
    rewriter_says(fake_openai, "how much do cats sleep")
    ask(client, chat, "and how long do they nap?", "msg-00000002")
    last = fake_openai.chat.completions.create.call_args.kwargs["messages"][-1]["content"]
    assert last.endswith("Question: and how long do they nap?")
    stored = client.get(f"/conversations/{chat}").json()["messages"]
    assert stored[2]["content"] == "and how long do they nap?"


def test_the_rewriter_sees_recent_history_and_instructions(client, chat, fake_openai):
    rewriter_says(fake_openai, "how much do cats sleep")
    ask(client, chat, "and how long do they nap?", "msg-00000002")
    sent = raw_create(fake_openai).call_args.kwargs
    assert "standalone" in sent["messages"][0]["content"]
    assert [m["content"] for m in sent["messages"][1:]] == [
        "tell me about cats", "Cats are mammals.", "and how long do they nap?",
    ]
    assert sent["max_completion_tokens"] == 120


@pytest.mark.parametrize("failure", [
    openai.APIConnectionError(request=REQ),
    openai.RateLimitError("x", response=httpx.Response(429, request=REQ), body=None),
])
def test_a_failed_rewrite_falls_back_to_the_original_question(client, chat, fake_openai, failure):
    raw_create(fake_openai).side_effect = failure
    r = ask(client, chat, "how long do cats sleep", "msg-00000002")
    assert r.status_code == 200
    assert events(r)[0][1]["sources"][0]["filename"] == "cats.txt"  # still answered, from the raw question


@pytest.mark.parametrize("bad", ["", "   ", "x" * 501])
def test_an_unusable_rewrite_falls_back_to_the_original_question(client, chat, fake_openai, bad):
    rewriter_says(fake_openai, bad)
    evs = events(ask(client, chat, "how long do cats sleep", "msg-00000002"))
    assert evs[0][1]["sources"][0]["filename"] == "cats.txt"


def test_no_rewrite_call_is_made_when_there_are_no_documents(client, rag, fake_openai):
    cid = client.post("/conversations").json()["id"]
    fake_openai.chat.completions.create.return_value = FakeStream([chunk("a")])
    ask(client, cid, "first", "msg-00000001")
    fake_openai.chat.completions.create.return_value = FakeStream([chunk("b")])
    raw_create(fake_openai).reset_mock()
    evs = events(ask(client, cid, "and then?", "msg-00000002"))
    assert all(name != "sources" for name, _ in evs)
    raw_create(fake_openai).assert_not_called()
