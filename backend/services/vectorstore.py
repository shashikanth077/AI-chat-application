"""Where document vectors live and how they are searched.

VECTOR_STORE selects the index:

- sqlite (default): vectors sit in the chunks table and are compared by brute
  force. Exact, no extra service, and what the default tests run against.
- qdrant: vectors and their payload live in a Qdrant collection (see
  qdrant_store.py). SQLite still owns documents, chunk text and citations.

Consistency rules. SQLite is the source of truth:
- Upload writes the index first, then commits SQLite. If the commit fails, the
  points are removed again.
- Delete commits SQLite first, then removes the points. If that removal fails,
  the leftover points are harmless: search ignores points with no stored
  document, and `reindex_qdrant.py --prune` removes them.
"""
import logging
import os

import numpy as np
from langchain_core.retrievers import BaseRetriever
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Document as StoredDocument
from schemas import SearchResult
from services import qdrant_store, retrieval
from services.embeddings import get_embedder
from services.errors import VectorStoreError
from services.retriever import QdrantRetriever, SqliteRetriever, to_search_result

logger = logging.getLogger(__name__)

BACKENDS = ("sqlite", "qdrant")


def backend() -> str:
    value = os.getenv("VECTOR_STORE", "sqlite").strip().lower() or "sqlite"
    if value not in BACKENDS:
        logger.error("Unknown VECTOR_STORE: %r", value)
        raise VectorStoreError("The vector store is not configured correctly. Check VECTOR_STORE.")
    return value


def _qdrant_call(action: str, safe_message: str, fn, *args) -> None:
    """Run a Qdrant write. Errors are logged by type only and turned into a safe message."""
    try:
        fn(*args)
    except VectorStoreError:
        raise
    except Exception as exc:
        logger.error("Vector index %s failed: %s", action, type(exc).__name__)
        raise VectorStoreError(safe_message) from exc


def add_document(document_id: str, filename: str, chunks: list[str], vectors: np.ndarray, embedder_name: str) -> None:
    """Index a document's chunks. Called before the SQLite commit. A no-op for SQLite, whose rows are written in the same transaction."""
    if backend() == "qdrant":
        _qdrant_call(
            "write", "The document could not be indexed. Please try again.",
            qdrant_store.upsert_chunks, document_id, filename, embedder_name, chunks, vectors,
        )


def delete_document(document_id: str, embedder_name: str) -> None:
    """Remove a document's points. Called after the SQLite delete is committed (see the module note)."""
    if backend() == "qdrant":
        _qdrant_call(
            "delete", "The document could not be removed from the search index. It is hidden from answers.",
            qdrant_store.delete_document, document_id, embedder_name,
        )


def search(db: Session, query: str, top_k: int) -> list[SearchResult]:
    """Top chunks for a query, best first, with no relevance threshold (the search panel shows everything)."""
    if backend() == "sqlite":
        return retrieval.search(db, query, top_k)
    docs = QdrantRetriever(db=db, embedder=get_embedder(), top_k=top_k, min_score=0.0).invoke(query)
    return [to_search_result(doc) for doc in docs]


def get_retriever(db: Session, top_k: int, min_score: float) -> BaseRetriever:
    """The LangChain retriever the answer pipeline uses, for the configured backend."""
    if backend() == "qdrant":
        return QdrantRetriever(db=db, embedder=get_embedder(), top_k=top_k, min_score=min_score)
    return SqliteRetriever(db=db, top_k=top_k, min_score=min_score)


def reindex(db: Session) -> int:
    """Copy every stored document for the current embedding model into Qdrant.

    Uses the vectors already in SQLite, so nothing is re-embedded. Returns the number of documents.
    """
    embedder = get_embedder()
    documents = db.scalars(select(StoredDocument).where(StoredDocument.embedding_model == embedder.name)).all()
    for document in documents:
        chunks = [chunk.text for chunk in document.chunks]
        vectors = np.stack([np.frombuffer(chunk.embedding, dtype=np.float32) for chunk in document.chunks])
        _qdrant_call("reindex", "Reindexing failed. Check the Qdrant settings.",
                     qdrant_store.upsert_chunks, document.id, document.filename, embedder.name, chunks, vectors)
    return len(documents)


def prune(db: Session) -> int:
    """Remove index entries for documents that are no longer stored. Returns how many documents were removed."""
    embedder = get_embedder()
    live = set(db.scalars(select(StoredDocument.id).where(StoredDocument.embedding_model == embedder.name)))
    name = qdrant_store.collection_name(embedder.name)
    removed: list[int] = []
    _qdrant_call("prune", "Pruning failed. Check the Qdrant settings.",
                 lambda: removed.append(qdrant_store.delete_orphans(name, live)))
    return removed[0]
