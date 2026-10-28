import re

DEFAULT_MAX_CHARS = 800  # roughly 200 tokens: small enough to be specific, big enough to keep context
DEFAULT_OVERLAP = 100    # shared text between neighbours, so an idea cut at a boundary survives


def chunk_text(text: str, max_chars: int = DEFAULT_MAX_CHARS, overlap: int = DEFAULT_OVERLAP) -> list[str]:
    """Split text into chunks of at most `max_chars`, preferring natural boundaries.

    Paragraphs are the unit. Short ones are packed together; a paragraph longer
    than max_chars is split at sentence ends, and as a last resort at spaces.
    Inside a long paragraph, each chunk after the first starts with the tail of
    the previous one. Between separate paragraphs the overlap is best-effort:
    it is added only if it fits, since a paragraph break is already a natural boundary.
    """
    paragraphs = [re.sub(r"[ \t]+", " ", p).strip() for p in re.split(r"\n\s*\n", text.replace("\r\n", "\n"))]
    # Long paragraphs are cut a little short of max_chars, leaving room to
    # prepend the overlap without going over the limit.
    piece_limit = max_chars if overlap <= 0 else max(max_chars - overlap - 1, max_chars // 2)
    pieces: list[str] = []
    for paragraph in filter(None, paragraphs):
        pieces.extend([paragraph] if len(paragraph) <= max_chars else _split_long(paragraph, piece_limit))

    chunks: list[str] = []
    current = ""
    for piece in pieces:
        if not current:
            current = piece
        elif len(current) + 2 + len(piece) <= max_chars:
            current += "\n\n" + piece
        else:
            chunks.append(current)
            room = max_chars - len(piece) - 1
            tail = _tail(current, min(overlap, room)) if room >= 20 else ""
            current = f"{tail} {piece}" if tail else piece
    if current:
        chunks.append(current)
    return chunks


def _split_long(paragraph: str, max_chars: int) -> list[str]:
    out: list[str] = []
    current = ""
    for sentence in re.split(r"(?<=[.!?])\s+", paragraph):
        while len(sentence) > max_chars:  # no punctuation to cut at: break at a space
            cut = sentence.rfind(" ", 0, max_chars)
            cut = cut if cut > 0 else max_chars
            if current:
                out.append(current)
                current = ""
            out.append(sentence[:cut])
            sentence = sentence[cut:].lstrip()
        if not sentence:
            continue
        if not current:
            current = sentence
        elif len(current) + 1 + len(sentence) <= max_chars:
            current += " " + sentence
        else:
            out.append(current)
            current = sentence
    if current:
        out.append(current)
    return out


def _tail(text: str, size: int) -> str:
    """The last ~`size` characters of text, starting on a word boundary."""
    if size <= 0:
        return ""
    tail = text[-size:]
    space = tail.find(" ")
    return tail[space + 1 :] if space != -1 and len(text) > size else tail
