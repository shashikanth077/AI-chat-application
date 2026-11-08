"""Qdrant as the vector index, and the LangChain retrievers over it.

Qdrant runs in-memory here (qdrant-client's local mode): no server, no network.
A real Qdrant server is covered by docker-compose.yml and is not part of the test run.
"""
import importlib.util
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from qdrant_client import QdrantClient
from sqlalchemy.orm import Session
from test_documents import CATS, SPACE, upload

import main
from models import Document
from services import qdrant_store, vectorstore
from services.embeddings import get_embedder
from services.errors import SEARCH_UNAVAILABLE
from services.retriever import QdrantRetriever, SqliteRetriever

TOOL = Path(__file__).resolve().parent.parent / "tools" / "reindex_qdrant.py"


def collection():
    return qdrant_store.collection_name(get_embedder().name)


def point_count(qdrant: QdrantClient) -> int:
    return qdrant.count(collection()).count if qdrant.collection_exists(collection()) else 0


def search(client, query: str, top_k: int = 4):
    r = client.post("/documents/search", json={"query": query, "top_k": top_k})
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
def qdrant(rag, monkeypatch: pytest.MonkeyPatch):
    """An in-memory Qdrant, selected through the environment like a real deployment."""
    client = QdrantClient(location=":memory:")
    qdrant_store.set_client(client)
    monkeypatch.setenv("VECTOR_STORE", "qdrant")
    yield client
    qdrant_store.set_client(None)


@pytest.fixture
def sqlite_then_qdrant(rag, monkeypatch: pytest.MonkeyPatch):
    """Documents uploaded while SQLite is the backend; Qdrant is switched on afterwards."""
    client = QdrantClient(location=":memory:")
    qdrant_store.set_client(client)
    monkeypatch.setenv("VECTOR_STORE", "sqlite")
    yield client
    qdrant_store.set_client(None)


# ---------- configuration and naming ----------

def test_sqlite_is_the_default_backend():
    assert vectorstore.backend() == "sqlite"


def test_an_unknown_backend_is_a_safe_error(client, rag, monkeypatch):
    monkeypatch.setenv("VECTOR_STORE", "pinecone")
    r = client.post("/documents/search", json={"query": "cats"})
    assert r.status_code == 503
    assert "not configured correctly" in r.json()["detail"]


def test_collections_are_per_embedding_model_and_safe_to_name():
    assert qdrant_store.collection_name("hashing:384") == "chunks_hashing_384"
    assert qdrant_store.collection_name("BAAI/bge-small-en-v1.5") == "chunks_baai_bge_small_en_v1_5"


def test_point_ids_are_deterministic_so_reindexing_overwrites():
    assert qdrant_store.point_id("doc-1", 0) == qdrant_store.point_id("doc-1", 0)
    assert qdrant_store.point_id("doc-1", 0) != qdrant_store.point_id("doc-1", 1)


def test_missing_qdrant_settings_are_a_safe_503(client, rag, monkeypatch):
    monkeypatch.setenv("VECTOR_STORE", "qdrant")
    qdrant_store.set_client(None)
    r = upload(client, "cats.txt", CATS)
    assert r.status_code == 503
    assert "Qdrant is not configured" in r.json()["detail"]
    assert client.get("/documents").json() == []  # nothing stored half-way


def test_info_reports_the_vector_store(client, qdrant):
    assert client.get("/info").json()["vector_store"] == "qdrant"


# ---------- writes ----------

def test_upload_writes_one_point_per_chunk_with_a_langchain_payload(client, qdrant):
    doc = upload(client, "cats.txt", CATS).json()
    assert point_count(qdrant) == doc["chunk_count"]
    points, _ = qdrant.scroll(collection(), with_payload=True, limit=10)
    assert {p.payload["metadata"]["document_id"] for p in points} == {doc["id"]}
    assert all(p.payload["page_content"] for p in points)
    assert points[0].payload["metadata"]["filename"] == "cats.txt"


def test_deleting_a_document_removes_its_points_and_keeps_the_others(client, qdrant):
    cats = upload(client, "cats.txt", CATS).json()
    upload(client, "space.txt", SPACE)
    before = point_count(qdrant)
    assert client.delete(f"/documents/{cats['id']}").status_code == 204
    assert point_count(qdrant) == before - cats["chunk_count"]
    assert all(hit["filename"] == "space.txt" for hit in search(client, "cats sleep and purr"))


def test_a_failed_index_delete_still_deletes_and_is_hidden_from_search(client, qdrant, monkeypatch):
    cats = upload(client, "cats.txt", CATS).json()
    upload(client, "space.txt", SPACE)

    def broken(*_args):
        raise ConnectionError("qdrant unreachable at 10.0.0.5")

    monkeypatch.setattr(qdrant_store, "delete_document", broken)
    assert client.delete(f"/documents/{cats['id']}").status_code == 204  # the user's delete succeeded
    assert "cats.txt" not in {hit["filename"] for hit in search(client, "cats sleep")}  # stale points hidden


def test_orphan_points_are_never_returned(client, qdrant):
    upload(client, "space.txt", SPACE)
    # A leftover from a crash: points whose document was never committed to SQLite.
    vectors = get_embedder().embed_documents(["Cats sleep most of the day."])
    qdrant_store.upsert_chunks("ghost-doc", "ghost.txt", get_embedder().name, ["Cats sleep most of the day."], vectors)
    assert "ghost.txt" not in {hit["filename"] for hit in search(client, "cats sleep most of the day")}


def test_a_failed_database_commit_removes_the_new_points(qdrant, rag, monkeypatch):
    real_commit = Session.commit

    def failing_commit(self):
        if any(isinstance(obj, Document) for obj in self.new):
            raise RuntimeError("disk full")
        return real_commit(self)

    monkeypatch.setattr(Session, "commit", failing_commit)
    client = TestClient(main.app, raise_server_exceptions=False)
    assert upload(client, "cats.txt", CATS).status_code == 500
    assert point_count(qdrant) == 0


# ---------- reads ----------

def test_qdrant_and_sqlite_rank_and_score_the_same(sqlite_then_qdrant, client, monkeypatch):
    upload(client, "cats.txt", CATS)
    upload(client, "space.txt", SPACE)
    expected = search(client, "how much do cats sleep", top_k=3)
    assert expected and expected[0]["filename"] == "cats.txt"  # the comparison must not be between two empty lists

    monkeypatch.setenv("VECTOR_STORE", "qdrant")
    indexed = vectorstore.reindex(_session())
    assert indexed == 2
    got = search(client, "how much do cats sleep", top_k=3)

    assert [(h["filename"], h["position"]) for h in got] == [(h["filename"], h["position"]) for h in expected]
    assert all(abs(a["score"] - b["score"]) < 1e-4 for a, b in zip(got, expected))


def test_the_retriever_returns_langchain_documents_with_metadata(client, qdrant):
    upload(client, "cats.txt", CATS)
    upload(client, "space.txt", SPACE)
    with _session() as db:
        docs = QdrantRetriever(db=db, embedder=get_embedder(), top_k=2, min_score=0.05).invoke("how much do cats sleep")
        assert docs and docs[0].metadata["filename"] == "cats.txt"
        assert "sleeps most of the day" in docs[0].page_content
        assert 0 < docs[0].metadata["score"] <= 1 and len(docs) <= 2
        assert QdrantRetriever(db=db, embedder=get_embedder(), top_k=2, min_score=0.99).invoke("cats") == []


def test_get_retriever_follows_the_configured_backend(qdrant, rag, monkeypatch):
    with _session() as db:
        assert isinstance(vectorstore.get_retriever(db, 4, 0.1), QdrantRetriever)
        monkeypatch.setenv("VECTOR_STORE", "sqlite")
        assert isinstance(vectorstore.get_retriever(db, 4, 0.1), SqliteRetriever)


def test_an_index_outage_is_a_safe_503(client, qdrant, monkeypatch):
    upload(client, "cats.txt", CATS)

    def down(*_args, **_kwargs):
        raise ConnectionError("connect to secret-host.internal:6333 refused")

    monkeypatch.setattr(qdrant, "query_points", down)
    r = client.post("/documents/search", json={"query": "cats"})
    assert r.status_code == 503
    assert r.json()["detail"] == SEARCH_UNAVAILABLE
    assert "secret-host" not in r.text


def test_an_answer_with_an_index_outage_is_a_503_before_streaming(client, qdrant, monkeypatch):
    upload(client, "cats.txt", CATS)
    cid = client.post("/conversations").json()["id"]

    def down(*_args, **_kwargs):
        raise ConnectionError("refused")

    monkeypatch.setattr(qdrant, "query_points", down)
    r = client.post(f"/conversations/{cid}/messages/stream",
                    json={"content": "how much do cats sleep", "client_message_id": "msg-00000001", "use_documents": True})
    assert r.status_code == 503 and "Turn off" in r.json()["detail"]


# ---------- reindex and prune ----------

def test_reindex_copies_stored_vectors_without_embedding_again(client, sqlite_then_qdrant, monkeypatch):
    cats = upload(client, "cats.txt", CATS).json()
    space = upload(client, "space.txt", SPACE).json()
    assert point_count(sqlite_then_qdrant) == 0

    monkeypatch.setenv("VECTOR_STORE", "qdrant")
    embedder = get_embedder()

    def no_embedding(*_args):
        raise AssertionError("reindex must reuse the stored vectors")

    monkeypatch.setattr(embedder, "embed_documents", no_embedding)
    assert vectorstore.reindex(_session()) == 2
    assert point_count(sqlite_then_qdrant) == cats["chunk_count"] + space["chunk_count"]


def test_prune_removes_entries_for_documents_deleted_from_the_database(client, qdrant):
    cats = upload(client, "cats.txt", CATS).json()
    space = upload(client, "space.txt", SPACE).json()
    with _session() as db:
        db.delete(db.get(Document, cats["id"]))  # deleted without the API, so the points are left behind
        db.commit()
        assert vectorstore.prune(db) == 1
    assert point_count(qdrant) == space["chunk_count"]
    assert all(hit["filename"] != "cats.txt" for hit in search(client, "cats sleep"))


def test_the_reindex_command_runs_end_to_end(client, sqlite_then_qdrant, monkeypatch, capsys):
    cats = upload(client, "cats.txt", CATS).json()
    monkeypatch.setenv("VECTOR_STORE", "qdrant")
    spec = importlib.util.spec_from_file_location("reindex_tool", TOOL)
    tool = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tool)
    assert tool.main(["--prune"]) == 0
    assert point_count(sqlite_then_qdrant) == cats["chunk_count"]
    assert "Indexed 1 document(s)." in capsys.readouterr().out


def _session() -> Session:
    import database

    return database.SessionLocal()
