import io

import numpy as np
import pytest
from pypdf import PdfWriter
from sqlalchemy import func, select

from models import Chunk, Document
from routers import documents as documents_router
from services import embeddings
from services.embeddings import EmbeddingError, HashingEmbedder

CATS = "Cats are small carnivorous mammals. A cat sleeps most of the day and purrs when content. Kittens play with string."
PYTHON = "Python is a programming language. Python code is readable, and Python has a large standard library for developers."
SPACE = "The planet Jupiter is a gas giant. Jupiter has dozens of moons and a great red storm in its atmosphere."


def upload(client, name, content, mime="text/plain"):
    data = content if isinstance(content, bytes) else content.encode()
    return client.post("/documents", files={"file": (name, data, mime)})


def make_pdf(text: str) -> bytes:
    """A minimal but real one-page PDF containing `text`."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    bodies = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, body in enumerate(bodies, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(bodies) + 1)
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (len(bodies) + 1, xref)
    return bytes(out)


# ---------- embedders ----------

def test_hashing_embedder_is_deterministic_and_unit_length():
    e = HashingEmbedder()
    a, b = e.embed_documents(["cats purr"]), e.embed_documents(["cats purr"])
    assert np.array_equal(a, b)
    assert abs(float(np.linalg.norm(a[0])) - 1.0) < 1e-5


def test_hashing_embedder_matches_shared_words_not_meaning():
    e = HashingEmbedder()
    docs = e.embed_documents(["cats are small mammals", "python is a language"])
    scores = docs @ e.embed_query("what do cats eat")
    assert scores[0] > scores[1]
    # honest limitation: no shared word means no similarity
    assert abs(float(docs[0] @ e.embed_query("kittens"))) < 0.2


def test_unknown_backend_is_a_safe_error(monkeypatch):
    monkeypatch.setenv("EMBEDDING_BACKEND", "nonsense")
    monkeypatch.setattr(embeddings, "_embedder", None)
    with pytest.raises(EmbeddingError):
        embeddings.get_embedder()


# ---------- upload ----------

def test_upload_text_stores_document_and_chunks(client, rag):
    r = upload(client, "cats.txt", CATS)
    assert r.status_code == 201
    body = r.json()
    assert body["filename"] == "cats.txt" and body["chunk_count"] == 1 and body["size_bytes"] == len(CATS)
    with rag.SessionLocal() as s:
        chunk = s.scalars(select(Chunk)).one()
        assert chunk.text == CATS
        assert len(np.frombuffer(chunk.embedding, dtype=np.float32)) == HashingEmbedder.DIM
        assert s.scalars(select(Document)).one().embedding_model == "hashing:384"


def test_markdown_and_long_text_are_chunked(client, rag):
    long_text = "\n\n".join(f"Section {i}. " + "Details about the topic. " * 20 for i in range(12))
    r = upload(client, "notes.md", long_text, "text/markdown")
    assert r.status_code == 201 and r.json()["chunk_count"] > 3


def test_pdf_text_is_extracted_and_searchable(client, rag):
    r = upload(client, "paper.pdf", make_pdf("Photosynthesis converts sunlight into chemical energy"), "application/pdf")
    assert r.status_code == 201
    hits = client.post("/documents/search", json={"query": "photosynthesis sunlight"}).json()
    assert hits and "Photosynthesis" in hits[0]["text"]


def test_pdf_without_text_is_rejected(client, rag):
    writer, buf = PdfWriter(), io.BytesIO()
    writer.add_blank_page(width=200, height=200)
    writer.write(buf)
    r = upload(client, "scan.pdf", buf.getvalue(), "application/pdf")
    assert r.status_code == 422 and "OCR" in r.json()["detail"]


def test_corrupt_pdf_is_rejected_safely(client, rag):
    r = upload(client, "bad.pdf", b"%PDF-1.4 this is not really a pdf", "application/pdf")
    assert r.status_code == 422
    assert r.json()["detail"] == "The PDF could not be read."


@pytest.mark.parametrize("name, content, status", [
    ("virus.exe", b"MZ...", 415),
    ("noextension", b"hello", 415),
    ("empty.txt", b"", 422),
    ("blank.txt", b"  \n\n  ", 422),
    ("binary.txt", b"\xff\xfe\x00\x01\x80", 422),
])
def test_bad_files_are_rejected_and_nothing_is_stored(client, rag, name, content, status):
    assert upload(client, name, content).status_code == status
    with rag.SessionLocal() as s:
        assert s.scalar(select(func.count()).select_from(Document)) == 0


def test_oversized_upload_is_413(client, rag, monkeypatch):
    monkeypatch.setattr(documents_router, "MAX_UPLOAD_BYTES", 100)
    assert upload(client, "big.txt", "x " * 100).status_code == 413


def test_document_limit_is_409(client, rag, monkeypatch):
    monkeypatch.setattr(documents_router, "MAX_DOCUMENTS", 2)
    assert upload(client, "a.txt", CATS).status_code == 201
    assert upload(client, "b.txt", PYTHON).status_code == 201
    assert upload(client, "c.txt", SPACE).status_code == 409


def test_too_many_chunks_is_422(client, rag, monkeypatch):
    monkeypatch.setattr(documents_router, "MAX_CHUNKS_PER_DOCUMENT", 2)
    text = "\n\n".join("paragraph " * 120 for _ in range(6))
    r = upload(client, "huge.txt", text)
    assert r.status_code == 422 and "too long" in r.json()["detail"]


def test_filename_is_reduced_to_a_safe_display_name(client, rag):
    assert upload(client, "../../etc/passwd.txt", CATS).json()["filename"] == "passwd.txt"
    assert upload(client, "C:\\Users\\me\\notes.md", CATS).json()["filename"] == "notes.md"


def test_embedding_failure_is_a_safe_503_and_stores_nothing(client, rag, monkeypatch):
    class Broken:
        name = "broken"
        def embed_documents(self, texts): raise EmbeddingError("The embedding model is unavailable. Check the server log.")
        def embed_query(self, text): raise EmbeddingError("The embedding model is unavailable. Check the server log.")

    monkeypatch.setattr(embeddings, "_embedder", Broken())
    r = upload(client, "cats.txt", CATS)
    assert r.status_code == 503 and "unavailable" in r.json()["detail"]
    with rag.SessionLocal() as s:
        assert s.scalar(select(func.count()).select_from(Document)) == 0
    assert client.post("/documents/search", json={"query": "cats"}).status_code == 503


# ---------- list / delete ----------

def test_list_newest_first_and_delete_cascades_to_chunks(client, rag):
    a = upload(client, "a.txt", CATS).json()["id"]
    b = upload(client, "b.txt", PYTHON).json()["id"]
    assert [d["id"] for d in client.get("/documents").json()] == [b, a]
    assert client.delete(f"/documents/{a}").status_code == 204
    assert client.delete(f"/documents/{a}").status_code == 404
    with rag.SessionLocal() as s:
        assert {c.document_id for c in s.scalars(select(Chunk))} == {b}


# ---------- search ----------

def test_search_ranks_the_relevant_document_first(client, rag):
    for name, text in [("cats.txt", CATS), ("python.txt", PYTHON), ("space.txt", SPACE)]:
        upload(client, name, text)
    for query, expected in [("how much do cats sleep", "cats.txt"), ("python programming language", "python.txt"), ("moons of jupiter", "space.txt")]:
        hits = client.post("/documents/search", json={"query": query, "top_k": 3}).json()
        assert hits[0]["filename"] == expected, (query, [h["filename"] for h in hits])
        assert hits == sorted(hits, key=lambda h: h["score"], reverse=True)


def test_search_respects_top_k_and_empty_library(client, rag):
    assert client.post("/documents/search", json={"query": "anything"}).json() == []
    for i in range(5):
        upload(client, f"d{i}.txt", f"{CATS} copy number {i}")
    assert len(client.post("/documents/search", json={"query": "cats", "top_k": 2}).json()) == 2
    assert len(client.post("/documents/search", json={"query": "cats", "top_k": 10}).json()) == 5


def test_search_result_shape(client, rag):
    upload(client, "cats.txt", CATS)
    hit = client.post("/documents/search", json={"query": "cats"}).json()[0]
    assert set(hit) == {"document_id", "filename", "position", "text", "score"}
    assert hit["position"] == 0 and 0 < hit["score"] <= 1.0001


@pytest.mark.parametrize("body", [
    {"query": ""}, {"query": "   "}, {"query": "x" * 501},
    {"query": "ok", "top_k": 0}, {"query": "ok", "top_k": 11}, {},
])
def test_invalid_search_is_422(client, rag, body):
    assert client.post("/documents/search", json=body).status_code == 422


def test_search_ignores_documents_made_by_a_different_embedding_model(client, rag):
    upload(client, "cats.txt", CATS)
    with rag.SessionLocal() as s:
        s.get(Document, s.scalars(select(Document.id)).one()).embedding_model = "some-other-model"
        s.commit()
    assert client.post("/documents/search", json={"query": "cats"}).json() == []
