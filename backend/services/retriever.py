"""The document store as a LangChain retriever.

`retrieval.search` (brute-force cosine over the SQLite chunk vectors) is
unchanged. This class only gives it LangChain's retriever interface, so it can
be dropped into any chain, and swapped for a vector-store retriever later,
without callers noticing: `retriever.invoke(question)` returns `Document`s.
"""
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from sqlalchemy.orm import Session

from schemas import SearchResult
from services import retrieval


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


def to_search_result(doc: Document) -> SearchResult:
    return SearchResult(
        document_id=doc.metadata["document_id"],
        filename=doc.metadata["filename"],
        position=doc.metadata["position"],
        text=doc.page_content,
        score=doc.metadata["score"],
    )
