"""The LangChain chain in services/llm.py."""
from langchain_openai import ChatOpenAI

from helpers import FakeStream, chunk
from schemas import ChatMessage
from services import llm


def sent(fake_openai):
    return fake_openai.chat.completions.create.call_args.kwargs


def test_braces_in_user_text_are_never_treated_as_template_variables(fake_openai):
    text = "Explain {system} and {history} and {{nested}} in f-strings"
    llm.generate_reply([ChatMessage(role="user", content=text)])
    assert sent(fake_openai)["messages"][-1] == {"role": "user", "content": text}


def test_roles_and_order_reach_the_provider(fake_openai):
    llm.generate_reply([
        ChatMessage(role="user", content="a"),
        ChatMessage(role="assistant", content="b"),
        ChatMessage(role="user", content="c"),
    ])
    messages = sent(fake_openai)["messages"]
    assert [(m["role"], m["content"]) for m in messages[1:]] == [("user", "a"), ("assistant", "b"), ("user", "c")]
    assert messages[0] == {"role": "system", "content": llm.SYSTEM_PROMPT}


def test_system_addendum_is_appended_to_the_server_prompt(fake_openai):
    fake_openai.chat.completions.create.return_value = FakeStream([chunk("ok")])
    list(llm.open_reply_stream([ChatMessage(role="user", content="hi")], "EXTRA RULES"))
    system = sent(fake_openai)["messages"][0]["content"]
    assert system.startswith(llm.SYSTEM_PROMPT) and system.endswith("EXTRA RULES")


def test_model_is_built_from_the_environment(monkeypatch):
    monkeypatch.setattr(llm, "_model", None)
    monkeypatch.setenv("OPENAI_API_KEY", "k")
    monkeypatch.setenv("OPENAI_MODEL", "some-model")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://api.groq.com/openai/v1")
    model = llm.get_chat_model()
    assert isinstance(model, ChatOpenAI)
    assert model.model_name == "some-model"
    assert model.openai_api_base == "https://api.groq.com/openai/v1"
    assert model.max_tokens == llm.MAX_OUTPUT_TOKENS
    assert llm.get_chat_model() is model  # built once, then reused
