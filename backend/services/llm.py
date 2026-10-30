"""The chat model, as a LangChain chain.

`prompt | model | parser` is one LCEL pipeline. The model is `ChatOpenAI`, which
speaks the Chat Completions API that OpenAI, Groq and other compatible
providers implement, so the same code works for all of them. Everything the
routes rely on is unchanged: `ChatServiceError`, and `open_reply_stream`
raising it *before* the first token so the route can still answer with an HTTP
status.
"""
import logging
import os
from collections.abc import Generator, Iterator

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI
from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    OpenAIError,
    RateLimitError,
)

from schemas import ChatMessage

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are a helpful, concise assistant in a chat application. "
    "Answer clearly. If you are unsure, say so instead of guessing."
)
REQUEST_TIMEOUT_SECONDS = 30.0
MAX_OUTPUT_TOKENS = 800  # caps the reply length, and therefore cost

# The system text is passed as a *variable*, never as a template, and the history
# as ready-made message objects, so braces in user text are never interpreted.
_PROMPT = ChatPromptTemplate.from_messages([("system", "{system}"), MessagesPlaceholder("history")])

_model: ChatOpenAI | None = None


class ChatServiceError(Exception):
    """An error that is safe to show to the client.

    Routes translate it into an HTTP response. `message` never contains
    secrets, prompts, or raw upstream error text.
    """

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def get_chat_model() -> ChatOpenAI:
    # Created lazily so the server can start (and /health work) without a key.
    global _model
    if _model is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.error("OPENAI_API_KEY is not set")
            raise ChatServiceError(500, "The server is not configured correctly.")
        model = os.getenv("OPENAI_MODEL")
        if not model:
            logger.error("OPENAI_MODEL is not set")
            raise ChatServiceError(500, "The server is not configured correctly.")
        # base_url points at any OpenAI-compatible provider (e.g. Groq:
        # https://api.groq.com/openai/v1). None means the default OpenAI URL.
        _model = ChatOpenAI(
            model=model,
            api_key=api_key,
            base_url=os.getenv("OPENAI_BASE_URL") or None,
            timeout=REQUEST_TIMEOUT_SECONDS,
            max_retries=2,
            max_tokens=MAX_OUTPUT_TOKENS,
        )
    return _model


def _translate(exc: OpenAIError) -> ChatServiceError:
    """Map a provider exception to a client-safe error.

    ChatOpenAI lets the OpenAI SDK's exceptions through unchanged, so the same
    mapping serves the normal and streaming paths. Order matters:
    APITimeoutError is a subclass of APIConnectionError.
    """
    if isinstance(exc, APITimeoutError):
        return ChatServiceError(504, "The AI took too long to respond. Please try again.")
    if isinstance(exc, APIConnectionError):
        return ChatServiceError(502, "Could not reach the AI service. Please try again.")
    if isinstance(exc, RateLimitError):
        return ChatServiceError(429, "Too many requests. Please wait a moment and retry.")
    if isinstance(exc, AuthenticationError):
        logger.error("Provider rejected the API key")
        return ChatServiceError(500, "The server is not configured correctly.")
    if isinstance(exc, APIStatusError):
        # Log the status only; never log prompts or the response body.
        logger.error("Provider returned HTTP %s", exc.status_code)
    else:
        logger.error("Provider error: %s", type(exc).__name__)
    return ChatServiceError(502, "The AI service returned an error.")


def _chain():
    return _PROMPT | get_chat_model() | StrOutputParser()


def _inputs(messages: list[ChatMessage], system_addendum: str = "") -> dict:
    history: list[BaseMessage] = [
        HumanMessage(content=m.content) if m.role == "user" else AIMessage(content=m.content) for m in messages
    ]
    system = f"{SYSTEM_PROMPT}\n\n{system_addendum}" if system_addendum else SYSTEM_PROMPT
    return {"system": system, "history": history}


def generate_reply(messages: list[ChatMessage]) -> str:
    chain = _chain()
    try:
        reply = chain.invoke(_inputs(messages)).strip()
    except OpenAIError as exc:
        raise _translate(exc) from exc
    if not reply:
        raise ChatServiceError(502, "The AI returned an empty response.")
    return reply


def open_reply_stream(messages: list[ChatMessage], system_addendum: str = "") -> Generator[str, None, None]:
    """Start streaming a reply and return a generator of text pieces.

    This is a normal function, not a generator. It waits for the first piece of
    text, so any failure before then (bad key, rate limit, unreachable provider)
    is raised here as ChatServiceError, and the route can still answer with a
    proper HTTP status. Only the rest of the stream is lazy.
    """
    pieces = _text_pieces(_chain().stream(_inputs(messages, system_addendum)))
    try:
        first = next(pieces, None)
    except BaseException:
        pieces.close()
        raise
    return _replay(first, pieces)


def _text_pieces(stream: Iterator[str]) -> Generator[str, None, None]:
    """Non-empty text pieces, with provider failures translated to ChatServiceError."""
    try:
        for text in stream:
            if text:  # some chunks carry no text (role-only first chunk, usage chunk)
                yield text
    except OpenAIError as exc:
        raise _translate(exc) from exc
    finally:
        # Also runs when the client disconnects and the generator is closed,
        # so we stop paying for tokens nobody will read.
        close = getattr(stream, "close", None)
        if close:
            close()


def _replay(first: str | None, rest: Generator[str, None, None]) -> Generator[str, None, None]:
    try:
        if first is None:
            raise ChatServiceError(502, "The AI returned an empty response.")
        yield first
        yield from rest
    finally:
        rest.close()
