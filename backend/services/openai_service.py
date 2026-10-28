import logging
import os
from collections.abc import Generator
from typing import Any

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    OpenAI,
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

_client: OpenAI | None = None


class ChatServiceError(Exception):
    """An error that is safe to show to the client.

    Routes translate it into an HTTP response. `message` never contains
    secrets, prompts, or raw upstream error text.
    """

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _get_client() -> OpenAI:
    # Created lazily so the server can start (and /health work) without a key.
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.error("OPENAI_API_KEY is not set")
            raise ChatServiceError(500, "The server is not configured correctly.")
        # Optional: point the SDK at any OpenAI-compatible provider (e.g. Groq:
        # https://api.groq.com/openai/v1). None means the default OpenAI URL.
        _client = OpenAI(
            api_key=api_key,
            base_url=os.getenv("OPENAI_BASE_URL") or None,
            timeout=REQUEST_TIMEOUT_SECONDS,
            max_retries=2,
        )
    return _client


def _translate(exc: OpenAIError) -> ChatServiceError:
    """Map an SDK exception to a client-safe error.

    Shared by the normal and streaming paths. Order matters:
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


def _build_request(messages: list[ChatMessage], system_addendum: str = "") -> tuple[OpenAI, dict[str, Any]]:
    model = os.getenv("OPENAI_MODEL")
    if not model:
        logger.error("OPENAI_MODEL is not set")
        raise ChatServiceError(500, "The server is not configured correctly.")
    client = _get_client()
    # Chat Completions is the API OpenAI-compatible providers (Groq, etc.)
    # all implement, so one code path works for both.
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": f"{SYSTEM_PROMPT}\n\n{system_addendum}" if system_addendum else SYSTEM_PROMPT},
            *[{"role": m.role, "content": m.content} for m in messages],
        ],
        "max_completion_tokens": MAX_OUTPUT_TOKENS,
    }
    return client, kwargs


def generate_reply(messages: list[ChatMessage]) -> str:
    client, kwargs = _build_request(messages)
    try:
        response = client.chat.completions.create(**kwargs)
    except OpenAIError as exc:
        raise _translate(exc) from exc

    reply = (response.choices[0].message.content or "").strip() if response.choices else ""
    if not reply:
        raise ChatServiceError(502, "The AI returned an empty response.")
    return reply


def open_reply_stream(messages: list[ChatMessage], system_addendum: str = "") -> Generator[str, None, None]:
    """Start a streaming completion and return a generator of text pieces.

    This is a normal function, not a generator: the request is sent, and any
    failure that happens *before* the first token (bad key, rate limit,
    unreachable provider) is raised here as ChatServiceError. The route can
    then still answer with a proper HTTP status. Only the returned generator
    is lazy.
    """
    client, kwargs = _build_request(messages, system_addendum)
    try:
        stream = client.chat.completions.create(**kwargs, stream=True)
    except OpenAIError as exc:
        raise _translate(exc) from exc
    return _iter_deltas(stream)


def _iter_deltas(stream: Any) -> Generator[str, None, None]:
    produced = False
    try:
        for chunk in stream:
            # Some chunks carry no text (role-only first chunk, usage chunk).
            if not chunk.choices:
                continue
            text = chunk.choices[0].delta.content
            if text:
                produced = True
                yield text
    except OpenAIError as exc:
        raise _translate(exc) from exc
    finally:
        # Also runs when the client disconnects and the generator is closed,
        # so we stop paying for tokens nobody will read.
        stream.close()
    if not produced:
        raise ChatServiceError(502, "The AI returned an empty response.")
