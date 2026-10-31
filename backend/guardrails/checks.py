"""What to do with text on the way in (messages, documents) and out (model replies)."""
import re
from collections.abc import Generator
from dataclasses import dataclass, field

from guardrails import detectors, policy

BLOCKED_SECRET = (
    "That looks like it contains a secret (an API key, token, password or private key), so it was not sent or saved. "
    "Remove it and try again."
)
BLOCKED_PII = (
    "That looks like it contains personal data (an email, phone, card, ID or bank number), so it was not sent or saved. "
    "Remove it and try again."
)


class GuardrailBlocked(Exception):
    """The input must not be processed. `message` is safe to show: it never repeats the sensitive text."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


@dataclass
class Checked:
    text: str                                            # what to store and send onward
    redacted: dict[str, int] = field(default_factory=dict)  # kind -> how many were masked


def check_input(text: str) -> Checked:
    """Apply the policy to a user message. Raises GuardrailBlocked, or returns (possibly masked) text."""
    p = policy.current()
    if not p.enabled:
        return Checked(text)
    mask: list[detectors.Finding] = []
    secrets = detectors.find(text, detectors.SECRET) if p.secrets != "off" else []
    if secrets and p.secrets == "block":
        raise GuardrailBlocked(BLOCKED_SECRET)
    mask += secrets
    pii = detectors.find(text, detectors.PII) if p.pii != "off" else []
    if pii and p.pii == "block":
        raise GuardrailBlocked(BLOCKED_PII)
    mask += pii
    if not mask:
        return Checked(text)
    # A secret can overlap a PII match (an email inside a password=...): find() settles overlaps once.
    final = detectors.find(text) if (p.secrets != "off" and p.pii != "off") else sorted(mask, key=lambda f: f.start)
    return Checked(detectors.redact(text, final), detectors.summarize(final))


@dataclass
class CheckedDocument:
    text: str
    redacted: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def check_document(text: str) -> CheckedDocument:
    """Uploaded files: secrets are rejected, personal data is masked before chunking and storing."""
    p = policy.current()
    if not p.enabled:
        return CheckedDocument(text)
    result = check_input(text)  # same rules as a message (raises on a secret or, in block mode, PII)
    warnings = []
    if detectors.looks_like_injection(text):
        warnings.append(
            "This file contains text that tries to give instructions to an AI. It is treated as untrusted reference "
            "text, but review it before relying on answers from it."
        )
    return CheckedDocument(result.text, result.redacted, warnings)


# ---------- output ----------

_KEY_END = re.compile(r"-----END [A-Z ]*PRIVATE KEY-----")
HOLD = 96  # characters kept back while streaming, so a secret split across two chunks is still caught


def redact_output(text: str) -> str:
    """A complete reply: secrets and personal data are always masked on the way out (unless guardrails are off)."""
    if not policy.current().enabled:
        return text
    return detectors.redact(text, detectors.find(text))


class StreamRedactor:
    """Masks secrets and personal data in streamed text without waiting for the whole reply.

    A match can straddle two chunks ("sk-abc" then "def..."), so the last HOLD
    characters are held back until more text arrives. If a match already begun
    reaches into the held-back part, the cut moves past its end.
    """

    def __init__(self) -> None:
        self._buf = ""

    def feed(self, chunk: str) -> str:
        self._buf += chunk
        if len(self._buf) <= HOLD:
            return ""
        findings = detectors.find(self._buf)
        cut = len(self._buf) - HOLD
        for f in findings:
            if f.start < cut < f.end:
                cut = f.end
        # A private key whose END line hasn't arrived yet runs to the end of the buffer: hold it all back.
        for f in findings:
            if f.kind == "PRIVATE_KEY" and f.end == len(self._buf) and not _KEY_END.search(self._buf[f.start:f.end]):
                cut = min(cut, f.start)
        out = detectors.redact(self._buf[:cut], [f for f in findings if f.end <= cut])
        self._buf = self._buf[cut:]
        return out

    def flush(self) -> str:
        out = detectors.redact(self._buf, detectors.find(self._buf))
        self._buf = ""
        return out


def guard_stream(deltas: Generator[str, None, None]) -> Generator[str, None, None]:
    """Wrap a stream of reply text. Closing this closes the upstream stream, so Stop still stops billing."""
    if not policy.current().enabled:
        yield from deltas
        return
    redactor = StreamRedactor()
    try:
        for piece in deltas:
            out = redactor.feed(piece)
            if out:
                yield out
    except GeneratorExit:
        raise  # the client left: nothing more can be sent
    except Exception:
        # The stream failed midway: release the held-back text (masked) so the saved partial reply is complete.
        tail = redactor.flush()
        if tail:
            yield tail
        raise
    else:
        tail = redactor.flush()
        if tail:
            yield tail
    finally:
        deltas.close()
