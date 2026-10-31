"""Guardrail settings, read from the environment on every call so tests (and operators) can change them."""
import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Policy:
    enabled: bool
    secrets: str  # "block" | "redact" | "off"   what to do with API keys, tokens, private keys in INPUT
    pii: str      # "redact" | "block" | "off"    what to do with personal data in INPUT and documents


def _choice(name: str, default: str, allowed: set[str]) -> str:
    value = os.getenv(name, default).strip().lower()
    return value if value in allowed else default


def current() -> Policy:
    enabled = os.getenv("GUARDRAILS", "on").strip().lower() not in {"0", "false", "no", "off"}
    return Policy(
        enabled=enabled,
        secrets=_choice("GUARDRAIL_SECRETS", "block", {"block", "redact", "off"}),
        pii=_choice("GUARDRAIL_PII", "redact", {"redact", "block", "off"}),
    )
