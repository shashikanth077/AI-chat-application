import json
from collections.abc import Callable, Generator
from typing import Any

from fastapi.responses import StreamingResponse

from services.openai_service import ChatServiceError


def sse(data: dict[str, Any], event: str | None = None) -> str:
    """Format one Server-Sent Event. JSON keeps newlines in the text safe."""
    prefix = f"event: {event}\n" if event else ""
    return f"{prefix}data: {json.dumps(data)}\n\n"


def sse_events(
    deltas: Generator[str, None, None],
    on_finish: Callable[[str], None] | None = None,
    preface: list[str] | None = None,
) -> Generator[str, None, None]:
    """Turn text pieces into SSE frames.

    Once streaming starts the HTTP status is already 200, so a later failure
    can only be reported as an in-stream "error" event. `on_finish` receives
    everything streamed so far and runs however the stream ends: completed,
    failed, or closed because the client went away (Stop / closed tab).
    """
    parts: list[str] = []
    try:
        yield from preface or []  # ready-made frames sent before the first token
        for text in deltas:
            parts.append(text)
            yield sse({"delta": text})
        yield sse({}, event="done")
    except ChatServiceError as exc:
        yield sse({"detail": exc.message}, event="error")
    finally:
        deltas.close()  # stop the upstream request if the client left
        if on_finish:
            on_finish("".join(parts))


def sse_response(
    deltas: Generator[str, None, None],
    on_finish: Callable[[str], None] | None = None,
    preface: list[str] | None = None,
) -> StreamingResponse:
    return StreamingResponse(
        sse_events(deltas, on_finish, preface),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
