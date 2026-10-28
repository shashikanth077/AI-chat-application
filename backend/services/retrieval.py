import numpy as np
from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Chunk, Document
from schemas import SearchResult
from services.embeddings import get_embedder


def search(db: Session, query: str, top_k: int) -> list[SearchResult]:
    """The chunks most similar to `query`, best first.

    Brute force: every stored vector is compared. That is exact, and fast for
    thousands of chunks. Far beyond that you would move to an index (for
    example pgvector or sqlite-vec) without changing this function's contract.
    """
    embedder = get_embedder()
    query_vector = embedder.embed_query(query)

    # Only vectors made by the current model can be compared with the query.
    rows = db.execute(
        select(Chunk.id, Chunk.embedding)
        .join(Document, Chunk.document_id == Document.id)
        .where(Document.embedding_model == embedder.name)
    ).all()
    if not rows:
        return []

    matrix = np.stack([np.frombuffer(row.embedding, dtype=np.float32) for row in rows])
    scores = matrix @ query_vector  # unit vectors: dot product == cosine similarity
    best = np.argsort(-scores)[:top_k]
    score_by_id = {rows[i].id: float(scores[i]) for i in best}

    # Fetch text only for the winners, not for every chunk.
    found = db.execute(
        select(Chunk, Document.filename)
        .join(Document, Chunk.document_id == Document.id)
        .where(Chunk.id.in_(score_by_id))
    ).all()
    results = [
        SearchResult(
            document_id=chunk.document_id,
            filename=filename,
            position=chunk.position,
            text=chunk.text,
            score=round(score_by_id[chunk.id], 4),
        )
        for chunk, filename in found
    ]
    return sorted(results, key=lambda r: r.score, reverse=True)
