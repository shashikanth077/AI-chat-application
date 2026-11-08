"""Qdrant, an open-source vector database, as the document vector index.

Qdrant keeps one collection per embedding model. Each point is one chunk: its
vector, plus a payload laid out the way LangChain's QdrantVectorStore reads it
(page_content and metadata), so LangChain can search the collection directly.

Run Qdrant as a server (QDRANT_URL; see docker-compose.yml) or embedded on disk
(QDRANT_PATH) for development. Tests use an in-memory client.
"""
import atexit
import logging
import os
import re
import uuid
import warnings

import numpy as np
from langchain_core.embeddings import Embeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient, models

from services.embeddings import Embedder
from services.errors import VectorStoreError

logger = logging.getLogger(__name__)

COLLECTION_PREFIX = "chunks"
UPSERT_BATCH = 256
_ID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "ai-chat/chunk")
_client: QdrantClient | None = None


def set_client(client: QdrantClient | None) -> None:
    """Replace the client (tests use an in-memory one). None means "create it from the environment again"."""
    global _client
    _client = client


def client() -> QdrantClient:
    global _client
    if _client is None:
        url = os.getenv("QDRANT_URL", "").strip()
        path = os.getenv("QDRANT_PATH", "").strip()
        if url:
            # The API key is never logged. Qdrant has no login unless one is set, so set one in production.
            _client = QdrantClient(url=url, api_key=os.getenv("QDRANT_API_KEY") or None, timeout=10)
        elif path:
            _client = QdrantClient(path=path)
            # Embedded mode flushes and releases its files on close; do it at exit rather than in a finalizer.
            atexit.register(lambda: _client and _client.close())
        else:
            raise VectorStoreError("Qdrant is not configured. Set QDRANT_URL or QDRANT_PATH.")
    return _client


def collection_name(embedder_name: str) -> str:
    """One collection per embedding model: vectors from different models are never compared."""
    slug = re.sub(r"[^a-z0-9]+", "_", embedder_name.lower()).strip("_")
    return f"{COLLECTION_PREFIX}_{slug}"


def point_id(document_id: str, position: int) -> str:
    """Deterministic, so re-indexing a document overwrites its points instead of duplicating them."""
    return str(uuid.uuid5(_ID_NAMESPACE, f"{document_id}:{position}"))


def _document_filter(document_id: str) -> models.Filter:
    return models.Filter(must=[models.FieldCondition(key="metadata.document_id", match=models.MatchValue(value=document_id))])


def _ensure_collection(name: str, size: int) -> None:
    c = client()
    if not c.collection_exists(name):
        c.create_collection(name, vectors_config=models.VectorParams(size=size, distance=models.Distance.COSINE))
        # Deletes and per-document lookups filter on this field; index it. Embedded (local) mode
        # has no payload indexes and warns about it: harmless there, so the warning is silenced.
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="Payload indexes have no effect")
            c.create_payload_index(name, field_name="metadata.document_id", field_schema=models.PayloadSchemaType.KEYWORD)


def upsert_chunks(document_id: str, filename: str, embedder_name: str, chunks: list[str], vectors: np.ndarray) -> None:
    name = collection_name(embedder_name)
    vectors = np.asarray(vectors, dtype=np.float32)
    _ensure_collection(name, int(vectors.shape[1]))
    points = [
        models.PointStruct(
            id=point_id(document_id, i),
            vector=vector.tolist(),
            payload={
                "page_content": text,
                "metadata": {"document_id": document_id, "filename": filename, "position": i, "embedding_model": embedder_name},
            },
        )
        for i, (text, vector) in enumerate(zip(chunks, vectors))
    ]
    c = client()
    for start in range(0, len(points), UPSERT_BATCH):
        c.upsert(name, points=points[start : start + UPSERT_BATCH], wait=True)


def delete_document(document_id: str, embedder_name: str) -> None:
    name = collection_name(embedder_name)
    c = client()
    if c.collection_exists(name):
        c.delete(name, points_selector=models.FilterSelector(filter=_document_filter(document_id)), wait=True)


def indexed_document_ids(name: str) -> set[str]:
    """Every document id that has at least one point in the collection (paged, payload only)."""
    c = client()
    ids: set[str] = set()
    offset = None
    while True:
        points, offset = c.scroll(name, with_payload=["metadata.document_id"], with_vectors=False, limit=512, offset=offset)
        for point in points:
            document_id = (point.payload or {}).get("metadata", {}).get("document_id")
            if document_id:
                ids.add(document_id)
        if offset is None:
            return ids


def delete_orphans(name: str, live_ids: set[str]) -> int:
    """Remove points whose document is no longer stored in SQLite. Returns how many documents were removed."""
    if not client().collection_exists(name):
        return 0
    orphans = indexed_document_ids(name) - live_ids
    for document_id in orphans:
        client().delete(name, points_selector=models.FilterSelector(filter=_document_filter(document_id)), wait=True)
    return len(orphans)


class LangChainEmbeddings(Embeddings):
    """Adapts our Embedder to LangChain's Embeddings interface, so LangChain can search with the same model."""

    def __init__(self, embedder: Embedder) -> None:
        self._embedder = embedder

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embedder.embed_documents(texts).tolist()

    def embed_query(self, text: str) -> list[float]:
        return self._embedder.embed_query(text).tolist()


def langchain_store(name: str, embedder: Embedder) -> QdrantVectorStore:
    return QdrantVectorStore(
        client=client(),
        collection_name=name,
        embedding=LangChainEmbeddings(embedder),
        validate_collection_config=False,  # the collection was created by us, with the same settings
    )
