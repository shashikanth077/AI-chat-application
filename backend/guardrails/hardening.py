"""Abuse limits and response hardening: rate limits, request size cap, security headers, log scrubbing."""
import logging
import os
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from guardrails import detectors

# ---------- rate limiting ----------

_hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_MAX_TRACKED = 10_000


def reset_rate_limits() -> None:
    _hits.clear()


def client_key(request: Request) -> str:
    # Behind a reverse proxy every request comes from the proxy's address, so
    # trust X-Forwarded-For only when the operator says there is one in front.
    if os.getenv("TRUST_PROXY", "").strip().lower() in {"1", "true", "yes", "on"}:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(bucket: str, env_name: str, default_per_minute: int):
    """A FastAPI dependency allowing `env_name` (default `default_per_minute`) requests per minute per client."""

    def dependency(request: Request) -> None:
        try:
            limit = int(os.getenv(env_name, default_per_minute))
        except ValueError:
            limit = default_per_minute
        if limit <= 0:  # 0 turns the limit off
            return
        now = time.monotonic()
        window = _hits[(bucket, client_key(request))]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= limit:
            raise HTTPException(
                status_code=429,
                detail="Too many requests. Please wait a moment and retry.",
                headers={"Retry-After": str(max(1, int(60 - (now - window[0]))))},
            )
        window.append(now)
        if len(_hits) > _MAX_TRACKED:  # drop clients with no recent activity
            for key in [k for k, w in _hits.items() if not w or now - w[-1] > 60]:
                _hits.pop(key, None)

    return dependency


# ---------- request size ----------

DEFAULT_MAX_REQUEST_BYTES = 2_500_000  # a 2 MB upload plus multipart overhead


class _TooLarge(BaseException):  # BaseException: FastAPI's body parsing would turn an Exception into a 400
    pass


class BodyLimitMiddleware:
    """Rejects oversized request bodies with 413, including ones sent without a Content-Length."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        try:
            limit = int(os.getenv("MAX_REQUEST_BYTES", DEFAULT_MAX_REQUEST_BYTES))
        except ValueError:
            limit = DEFAULT_MAX_REQUEST_BYTES
        declared = dict(scope["headers"]).get(b"content-length")
        started = False

        async def too_large() -> None:
            body = b'{"detail":"The request is too large."}'
            await send({"type": "http.response.start", "status": 413,
                        "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
            await send({"type": "http.response.body", "body": body})

        if declared and declared.isdigit() and int(declared) > limit:
            return await too_large()

        received = 0

        async def limited():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise _TooLarge
            return message

        async def tracking_send(message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, limited, tracking_send)
        except _TooLarge:
            if not started:
                await too_large()


# ---------- security headers ----------

_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"referrer-policy", b"no-referrer"),
    (b"x-frame-options", b"DENY"),
    (b"cross-origin-resource-policy", b"same-site"),
]
_API_ONLY_HEADERS = [
    # This server only returns JSON and event streams, so nothing it sends should ever run as a page.
    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
    # Conversations and documents are private: keep them out of shared caches.
    (b"cache-control", b"no-store"),
]
_DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")


class SecurityHeadersMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        is_docs = scope["path"].startswith(_DOCS_PATHS)

        async def send_with_headers(message) -> None:
            if message["type"] == "http.response.start":
                present = {k.lower() for k, _ in message.get("headers", [])}
                extra = list(_HEADERS) + ([] if is_docs else _API_ONLY_HEADERS)
                message = {**message, "headers": [*message.get("headers", []), *[h for h in extra if h[0] not in present]]}
            await send(message)

        await self.app(scope, receive, send_with_headers)


# ---------- log scrubbing ----------

_installed = False


def install_log_scrubbing() -> None:
    """Defense in depth: even if some code logs a secret or personal data by mistake, it is masked first."""
    global _installed
    if _installed:
        return
    _installed = True
    previous = logging.getLogRecordFactory()

    def factory(*args, **kwargs):
        record = previous(*args, **kwargs)
        try:
            message = record.getMessage()
            found = detectors.find(message)
            if found:
                record.msg, record.args = detectors.redact(message, found), ()
        except Exception:  # logging must never fail because of the scrubber
            pass
        return record

    logging.setLogRecordFactory(factory)
