import logging
import os
import re
import zlib
from pathlib import Path
from typing import Protocol

import numpy as np

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"  # 384 dimensions, ~130 MB, runs on CPU
# Kept inside the project: fastembed's default is a temp folder that the OS may clear.
MODEL_CACHE_DIR = Path(__file__).resolve().parent.parent / ".model_cache"


class EmbeddingError(Exception):
    """Embeddings are unavailable. The message is safe to show to the client."""


class Embedder(Protocol):
    # Stored with every document. Vectors from different models are not
    # comparable, so search only looks at documents embedded by the current one.
    name: str
    # Starting point for "is this passage relevant?" for this model's score scale.
    # Scores are not comparable across models, so each one brings its own.
    default_min_score: float

    def embed_documents(self, texts: list[str]) -> np.ndarray: ...
    def embed_query(self, text: str) -> np.ndarray: ...


def _normalize(matrix: np.ndarray) -> np.ndarray:
    """Unit-length rows, so cosine similarity is just a dot product."""
    matrix = np.asarray(matrix, dtype=np.float32)
    norms = np.linalg.norm(matrix, axis=-1, keepdims=True)
    return matrix / np.where(norms == 0, 1.0, norms)


class FastEmbedEmbedder:
    """A real semantic model that runs locally. Downloaded once, then offline."""

    def __init__(self, model_name: str) -> None:
        self.name = f"fastembed:{model_name}"
        # A starting guess for bge-small, whose scores are compressed (related text
        # often 0.6 to 0.9, unrelated 0.3 to 0.5). Tune it with RAG_MIN_SCORE.
        self.default_min_score = 0.5
        self._model_name = model_name
        self._model = None

    def _load(self):
        if self._model is None:
            try:
                from fastembed import TextEmbedding

                MODEL_CACHE_DIR.mkdir(exist_ok=True)
                self._model = TextEmbedding(self._model_name, cache_dir=str(MODEL_CACHE_DIR))
            except Exception as exc:
                # Typically: no network on the very first run, so the model can't download.
                logger.error("Could not load embedding model: %s", type(exc).__name__)
                raise EmbeddingError("The embedding model is unavailable. Check the server log.") from exc
        return self._model

    def embed_documents(self, texts: list[str]) -> np.ndarray:
        try:
            return _normalize(np.array(list(self._load().embed(texts))))
        except EmbeddingError:
            raise
        except Exception as exc:
            logger.error("Embedding failed: %s", type(exc).__name__)
            raise EmbeddingError("Embedding failed. Check the server log.") from exc

    def embed_query(self, text: str) -> np.ndarray:
        try:
            # bge models are trained with a special query prefix; query_embed adds it.
            return _normalize(np.array(list(self._load().query_embed(text))))[0]
        except EmbeddingError:
            raise
        except Exception as exc:
            logger.error("Query embedding failed: %s", type(exc).__name__)
            raise EmbeddingError("Embedding failed. Check the server log.") from exc


class HashingEmbedder:
    """Offline and deterministic, with no model and no download.

    A bag of words: every word is hashed to one of `dim` slots. It matches
    SHARED WORDS, not meaning: "cat" and "kitten" are unrelated to it. Use it
    for tests and offline development; use the real model for real answers.
    """

    name = "hashing:384"
    default_min_score = 0.05  # word overlap gives small cosines
    DIM = 384
    _STOP = frozenset("a an and are as at be by for from has have in is it its of on or that the this to was were will with".split())

    def _vector(self, text: str) -> np.ndarray:
        vec = np.zeros(self.DIM, dtype=np.float32)
        for word in re.findall(r"[a-z0-9]+", text.lower()):
            if word in self._STOP:
                continue
            h = zlib.crc32(word.encode())  # stable across runs, unlike Python's hash()
            vec[h % self.DIM] += 1.0 if (h >> 16) & 1 else -1.0
        return vec

    def embed_documents(self, texts: list[str]) -> np.ndarray:
        return _normalize(np.stack([self._vector(t) for t in texts]))

    def embed_query(self, text: str) -> np.ndarray:
        return _normalize(self._vector(text)[None, :])[0]


_embedder: Embedder | None = None


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        backend = os.getenv("EMBEDDING_BACKEND", "fastembed")
        if backend == "hashing":
            _embedder = HashingEmbedder()
        elif backend == "fastembed":
            _embedder = FastEmbedEmbedder(os.getenv("EMBEDDING_MODEL") or DEFAULT_MODEL)
        else:
            logger.error("Unknown EMBEDDING_BACKEND: %r", backend)
            raise EmbeddingError("Embeddings are not configured correctly.")
    return _embedder
