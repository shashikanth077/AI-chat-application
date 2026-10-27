import logging
import os

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AuthenticationError,
    OpenAI,
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
        _client = OpenAI(api_key=api_key, timeout=REQUEST_TIMEOUT_SECONDS, max_retries=2)
    return _client


def generate_reply(messages: list[ChatMessage]) -> str:
    model = os.getenv("OPENAI_MODEL")
    if not model:
        logger.error("OPENAI_MODEL is not set")
        raise ChatServiceError(500, "The server is not configured correctly.")

    client = _get_client()
    try:
        response = client.responses.create(
            model=model,
            instructions=SYSTEM_PROMPT,
            input=[{"role": m.role, "content": m.content} for m in messages],
            max_output_tokens=MAX_OUTPUT_TOKENS,
        )
    except APITimeoutError:
        raise ChatServiceError(504, "The AI took too long to respond. Please try again.")
    except APIConnectionError:
        raise ChatServiceError(502, "Could not reach the AI service. Please try again.")
    except RateLimitError:
        raise ChatServiceError(429, "Too many requests. Please wait a moment and retry.")
    except AuthenticationError:
        logger.error("OpenAI rejected the API key")
        raise ChatServiceError(500, "The server is not configured correctly.")
    except APIStatusError as exc:
        # Log the status only; never log prompts or the response body.
        logger.error("OpenAI returned HTTP %s", exc.status_code)
        raise ChatServiceError(502, "The AI service returned an error.")

    reply = response.output_text.strip()
    if not reply:
        raise ChatServiceError(502, "The AI returned an empty response.")
    return reply
