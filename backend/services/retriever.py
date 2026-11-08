"""The document store as LangChain retrievers.

A retriever is anything with `.invoke(query) -> list[Document]`, so the answer
pipeline does not care whether the vectors are in SQLite or in Qdrant.

- SqliteRetriever: the brute-force search over the chunks table (the default).
- QdrantRetriever: LangChain's QdrantVectorStore over the Qdrant collection.

Both return Documents whose metadata carries document_id, filename, position
and score, and both drop passages below `min_score`.
"""
import logging
from typing import Any

from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Document as StoredDocument
from schemas import SearchResult
from services import qdrant_store, retrieval
from services.errors import SEARCH_UNAVAILABLE, VectorStoreError

logger = logging.getLogger(__name__)

# Qdrant returns the nearest chunks of ALL documents, including deleted ones whose points
# were not removed. Fetch extra, drop the stale ones, then keep top_k.
OVERFETCH = 3


class SqliteRetriever(BaseRetriever):
    db: Session
    top_k: int = 4
    min_score: float = 0.0  # passages scoring below this are treated as irrelevant

    model_config = {"arbitrary_types_allowed": True}

    def _get_relevant_documents(self, query: str, *, run_manager: CallbackManagerForRetrieverRun) -> list[Document]:
        return [
            Document(
                page_content=hit.text,
                metadata={
                    "document_id": hit.document_id,
                    "filename": hit.filename,
                    "position": hit.position,
                    "score": hit.score,
                },
            )
            for hit in retrieval.search(self.db, query, self.top_k)
            if hit.score >= self.min_score
        ]


class QdrantRetriever(BaseRetriever):
    db: Session
    embedder: Any  # an Embedder (see services/embeddings.py)
    top_k: int = 4
    min_score: float = 0.0

    model_config = {"arbitrary_types_allowed": True}

    def _get_relevant_documents(self, query: str, *, run_manager: CallbackManagerForRetrieverRun) -> list[Document]:
        name = qdrant_store.collection_name(self.embedder.name)
        # Embed first, outside the error handling below: a broken embedding model is an EmbeddingError (503),
        # exactly as the SQLite search behaves, even when no documents exist yet.
        vector = self.embedder.embed_query(query).tolist()
        # SQLite decides which documents exist. Points for anything else are ignored.
        live = set(self.db.scalars(select(StoredDocument.id).where(StoredDocument.embedding_model == self.embedder.name)))
        if not live:
            return []
        try:
            if not qdrant_store.client().collection_exists(name):
                return []
            store = qdrant_store.langchain_store(name, self.embedder)
            pairs = store.similarity_search_with_score_by_vector(vector, k=self.top_k * OVERFETCH)
        except VectorStoreError:
            raise
        except Exception as exc:
            # Never log the query or the chunk text: log the exception type only.
            logger.error("Vector search failed: %s", type(exc).__name__)
            raise VectorStoreError(SEARCH_UNAVAILABLE) from exc

        results: list[Document] = []
        for doc, score in pairs:
            meta = doc.metadata
            if meta.get("document_id") not in live or score < self.min_score:
                continue
            results.append(
                Document(
                    page_content=doc.page_content,
                    metadata={
                        "document_id": meta["document_id"],
                        "filename": meta["filename"],
                        "position": meta["position"],
                        "score": round(float(score), 4),
                    },
                )
            )
        return results[: self.top_k]


def to_search_result(doc: Document) -> SearchResult:
    return SearchResult(
        document_id=doc.metadata["document_id"],
        filename=doc.metadata["filename"],
        position=doc.metadata["position"],
        text=doc.page_content,
        score=doc.metadata["score"],
    )
