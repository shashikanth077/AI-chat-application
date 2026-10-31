"""The SQLite store behind LangChain's retriever interface (services/retriever.py)."""
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
from test_documents import CATS, SPACE, upload

from services.retriever import SqliteRetriever, to_search_result


def test_it_is_a_langchain_retriever_returning_documents_with_metadata(client, rag):
    upload(client, "cats.txt", CATS)
    upload(client, "space.txt", SPACE)
    with rag.SessionLocal() as db:
        retriever = SqliteRetriever(db=db, top_k=2)
        assert isinstance(retriever, BaseRetriever)
        docs = retriever.invoke("how much do cats sleep")
    assert docs and isinstance(docs[0], Document)
    assert docs[0].metadata["filename"] == "cats.txt"
    assert docs[0].metadata["position"] == 0 and 0 < docs[0].metadata["score"] <= 1
    assert "sleeps most of the day" in docs[0].page_content
    assert len(docs) <= 2


def test_min_score_drops_weak_matches(client, rag):
    upload(client, "cats.txt", CATS)
    with rag.SessionLocal() as db:
        assert SqliteRetriever(db=db, min_score=0.99).invoke("how much do cats sleep") == []


def test_documents_convert_back_to_search_results(client, rag):
    upload(client, "cats.txt", CATS)
    with rag.SessionLocal() as db:
        doc = SqliteRetriever(db=db).invoke("cats sleep")[0]
    result = to_search_result(doc)
    assert (result.filename, result.text, result.score) == ("cats.txt", doc.page_content, doc.metadata["score"])
