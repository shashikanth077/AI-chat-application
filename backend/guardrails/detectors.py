"""Find secrets and personal data in text.

These are pattern checks, so they are a safety net and not a guarantee: they
catch well-known key formats and checksummed numbers (cards, IBANs), not every
possible secret, and not names or addresses. Each match is validated where a
checksum exists, to keep false positives (order numbers, dates) low.
"""
import re
from dataclasses import dataclass

SECRET = "secret"
PII = "pii"


@dataclass(frozen=True)
class Finding:
    kind: str       # a label such as "API_KEY" or "EMAIL"
    category: str   # SECRET or PII
    start: int
    end: int


# ---------- validators ----------

def _luhn(digits: str) -> bool:
    total, flip = 0, False
    for ch in reversed(digits):
        d = int(ch)
        if flip:
            d = d * 2 - 9 if d * 2 > 9 else d * 2
        total += d
        flip = not flip
    return total % 10 == 0


def _valid_card(raw: str) -> bool:
    digits = re.sub(r"\D", "", raw)
    return 13 <= len(digits) <= 19 and len(set(digits)) > 1 and _luhn(digits)


def _valid_ssn(raw: str) -> bool:
    area, group, serial = raw.split("-")
    return area not in {"000", "666"} and not area.startswith("9") and group != "00" and serial != "0000"


def _valid_iban(raw: str) -> bool:
    iban = re.sub(r"\s", "", raw).upper()
    if not 15 <= len(iban) <= 34:
        return False
    rearranged = iban[4:] + iban[:4]
    number = "".join(str(int(c, 36)) for c in rearranged)  # A=10 ... Z=35
    return int(number) % 97 == 1


def _valid_phone(raw: str) -> bool:
    digits = re.sub(r"\D", "", raw)
    if not 10 <= len(digits) <= 15:
        return False
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw.strip()):  # an ISO date
        return False
    return bool(re.search(r"[\s().-]", raw) or raw.startswith("+"))  # bare digit runs are IDs, not phones


def _valid_assignment_value(value: str) -> bool:
    return any(c.isdigit() for c in value) or not value.isalpha()  # "password: something" is prose


# ---------- patterns ----------
# (label, category, regex, validator, capture-group-to-redact)
_PATTERNS: list[tuple[str, str, re.Pattern[str], object, int]] = [
    ("PRIVATE_KEY", SECRET, re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----(?:.*?-----END [A-Z ]*PRIVATE KEY-----|.*\Z)", re.S), None, 0),
    ("API_KEY", SECRET, re.compile(r"\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}|gsk_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abprs]-[A-Za-z0-9-]{10,}|hf_[A-Za-z0-9]{30,})"), None, 0),
    ("JWT", SECRET, re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}"), None, 0),
    ("BEARER_TOKEN", SECRET, re.compile(r"\bBearer\s+([A-Za-z0-9._~+/=-]{20,})"), None, 1),
    ("CREDENTIAL", SECRET, re.compile(r"(?i)\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|token)\b\s*[:=]\s*[\"']?([^\s\"']{7,}[^\s\"'.,;:!?)\]}])"), _valid_assignment_value, 1),
    ("CARD", PII, re.compile(r"(?<![\w-])(?:\d[ -]?){12,18}\d(?![\w-])"), _valid_card, 0),
    ("SSN", PII, re.compile(r"(?<![\w-])\d{3}-\d{2}-\d{4}(?![\w-])"), _valid_ssn, 0),
    ("IBAN", PII, re.compile(r"\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b"), _valid_iban, 0),
    ("EMAIL", PII, re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}"), None, 0),
    ("PHONE", PII, re.compile(r"(?<![\w.-])\+?\d[\d\s().-]{8,18}\d(?![\w-])"), _valid_phone, 0),
]
_PRIORITY = {name: i for i, (name, *_rest) in enumerate(_PATTERNS)}  # earlier = wins an overlap


def find(text: str, category: str | None = None) -> list[Finding]:
    """Non-overlapping findings, in text order. `category` limits to SECRET or PII."""
    found: list[Finding] = []
    for label, cat, pattern, validator, group in _PATTERNS:
        if category and cat != category:
            continue
        for m in pattern.finditer(text):
            if validator and not validator(m.group(group) if group else m.group(0)):  # type: ignore[operator]
                continue
            start, end = m.span(group)
            found.append(Finding(label, cat, start, end))
    # An overlap is resolved in favour of the higher-priority pattern, then the longer match.
    found.sort(key=lambda f: (_PRIORITY[f.kind], -(f.end - f.start)))
    kept: list[Finding] = []
    for f in found:
        if all(f.end <= k.start or f.start >= k.end for k in kept):
            kept.append(f)
    return sorted(kept, key=lambda f: f.start)


def placeholder(kind: str) -> str:
    return f"[REDACTED:{kind}]"


def redact(text: str, findings: list[Finding]) -> str:
    out, pos = [], 0
    for f in findings:
        out.append(text[pos:f.start])
        out.append(placeholder(f.kind))
        pos = f.end
    out.append(text[pos:])
    return "".join(out)


def summarize(findings: list[Finding]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for f in findings:
        counts[f.kind] = counts.get(f.kind, 0) + 1
    return counts


# Phrases typical of prompt-injection attempts. A weak signal, easy to evade, so
# it is only used to WARN about uploaded documents, never to block anything.
_INJECTION = re.compile(
    r"(?i)\b(?:ignore|disregard|forget)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all|any)\b[^.\n]{0,30}\b(?:instructions?|prompts?|rules)\b"
    r"|\b(?:reveal|show|print|repeat)\b[^.\n]{0,30}\b(?:system prompt|hidden instructions)\b"
    r"|\byou are now\b[^.\n]{0,40}\b(?:unrestricted|jailbroken|dan)\b"
)


def looks_like_injection(text: str) -> bool:
    return bool(_INJECTION.search(text))
