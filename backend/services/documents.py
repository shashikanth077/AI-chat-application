import io
import re
from pathlib import PurePath

from pypdf import PdfReader

ALLOWED_EXTENSIONS = {".txt", ".md", ".pdf"}


class DocumentError(Exception):
    """A problem with the uploaded file. The message is safe to show to the client."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def clean_filename(raw: str | None) -> str:
    """A display name only. Files are never written to disk, so this is not a path."""
    name = PurePath((raw or "").replace("\\", "/")).name  # drop any directories
    name = re.sub(r"[\x00-\x1f\x7f]", "", name).strip()
    return (name or "untitled")[:255]


def extension_of(filename: str) -> str:
    return PurePath(filename).suffix.lower()


def extract_text(filename: str, data: bytes) -> str:
    extension = extension_of(filename)
    if extension in {".txt", ".md"}:
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise DocumentError(422, "The file is not valid UTF-8 text.")
    elif extension == ".pdf":
        text = _pdf_text(data)
    else:
        raise DocumentError(415, "Unsupported file type. Use .txt, .md or .pdf.")

    if not text.strip():
        raise DocumentError(422, "No text could be extracted from the file. (Scanned PDFs need OCR.)")
    return text


def _pdf_text(data: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise DocumentError(422, "Encrypted PDFs are not supported.")
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    except DocumentError:
        raise
    except Exception:
        raise DocumentError(422, "The PDF could not be read.")
