import logging

import numpy as np
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from database import get_db
from guardrails.checks import GuardrailBlocked, check_document
from guardrails.hardening import rate_limit
from models import Chunk, Document
from schemas import DocumentSummary, SearchRequest, SearchResult
from services import retrieval
from services.chunking import chunk_text
from services.documents import DocumentError, clean_filename, extension_of, extract_text, ALLOWED_EXTENSIONS
from services.embeddings import EmbeddingError, get_embedder

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/documents", tags=["documents"])

MAX_UPLOAD_BYTES = 2_000_000
MAX_DOCUMENTS = 50
MAX_CHUNKS_PER_DOCUMENT = 400


@router.get("", response_model=list[DocumentSummary])
def list_documents(db: Session = Depends(get_db)) -> list[Document]:
    return list(db.scalars(select(Document).order_by(Document.created_at.desc())))


@router.post("", response_model=DocumentSummary, status_code=201, dependencies=[Depends(rate_limit("uploads", "RATE_LIMIT_UPLOADS_PER_MINUTE", 10))])
def upload_document(file: UploadFile = File(...), db: Session = Depends(get_db)) -> Document:
    filename = clean_filename(file.filename)
    if extension_of(filename) not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Unsupported file type. Use .txt, .md or .pdf.")

    # Read one byte more than allowed, so "too big" is detectable without
    # ever holding a huge file in memory.
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_UPLOAD_BYTES // 1_000_000} MB).")

    if db.scalar(select(func.count()).select_from(Document)) >= MAX_DOCUMENTS:
        raise HTTPException(status_code=409, detail="Document limit reached. Delete one first.")

    try:
        text = extract_text(filename, data)
        # Secrets are refused; personal data is masked BEFORE chunking, embedding and storing,
        # so neither the database nor the model ever sees it.
        checked = check_document(text)
        chunks = chunk_text(checked.text)
        if len(chunks) > MAX_CHUNKS_PER_DOCUMENT:
            raise DocumentError(422, f"The document is too long (over {MAX_CHUNKS_PER_DOCUMENT} chunks). Split it.")
        embedder = get_embedder()
        vectors = embedder.embed_documents(chunks)
    except GuardrailBlocked as exc:
        raise HTTPException(status_code=422, detail=exc.message, headers={"X-Guardrail": "blocked"})
    except DocumentError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    except EmbeddingError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # Only now is anything stored, so a failed upload leaves no half-indexed document.
    document = Document(
        filename=filename,
        size_bytes=len(data),
        chunk_count=len(chunks),
        embedding_model=embedder.name,
    )
    document.chunks = [
        Chunk(position=i, text=chunk, embedding=np.asarray(vector, dtype=np.float32).tobytes())
        for i, (chunk, vector) in enumerate(zip(chunks, vectors))
    ]
    db.add(document)
    db.commit()
    # Not stored: only the response says what was masked or flagged.
    document.redacted = checked.redacted  # type: ignore[attr-defined]
    document.warnings = checked.warnings  # type: ignore[attr-defined]
    return document


@router.delete("/{document_id}", status_code=204)
def delete_document(document_id: str, db: Session = Depends(get_db)) -> Response:
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    db.delete(document)  # its chunks go with it (cascade)
    db.commit()
    return Response(status_code=204)


@router.post("/search", dependencies=[Depends(rate_limit("search", "RATE_LIMIT_SEARCH_PER_MINUTE", 30))], response_model=list[SearchResult])
def search_documents(body: SearchRequest, db: Session = Depends(get_db)) -> list[SearchResult]:
    try:
        return retrieval.search(db, body.query, body.top_k)
    except EmbeddingError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
