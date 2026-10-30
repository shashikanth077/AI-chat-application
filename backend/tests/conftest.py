import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

# Make `import main` / `import schemas` work when pytest runs from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main  # noqa: E402
from services import llm  # noqa: E402
from helpers import completion  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


@pytest.fixture
def fake_openai(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Fake the OpenAI SDK at its boundary so tests never touch the network.

    A real ChatOpenAI and the real LangChain chain run on top of it; only the
    HTTP-calling `chat.completions` resource is replaced.
    """
    from langchain_openai import ChatOpenAI

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_MODEL", "test-model")
    fake = MagicMock()
    fake.chat.completions.create.return_value = completion("  Hello!  ")
    # Non-streaming calls go through with_raw_response; route them to the same mock
    # so tests set behaviour and read call arguments in one place.
    fake.chat.completions.with_raw_response.create.side_effect = lambda **kw: MagicMock(
        parse=lambda: fake.chat.completions.create(**kw)
    )
    monkeypatch.setattr(llm, "_model", ChatOpenAI(
        model="test-model", api_key="test-key", max_retries=0, max_tokens=llm.MAX_OUTPUT_TOKENS,
        client=fake.chat.completions,
    ))
    return fake


@pytest.fixture
def db(tmp_path, monkeypatch: pytest.MonkeyPatch):
    """A throwaway SQLite file per test, swapped in for the real database."""
    import database
    import models  # noqa: F401  (registers the tables)

    engine = database.make_engine(f"sqlite:///{tmp_path / 'test.db'}")
    database.Base.metadata.create_all(engine)
    monkeypatch.setattr(database, "engine", engine)
    monkeypatch.setattr(database, "SessionLocal", database.sessionmaker(bind=engine, expire_on_commit=False))
    yield database
    engine.dispose()


@pytest.fixture
def rag(db, monkeypatch: pytest.MonkeyPatch):
    """Database plus the offline hashing embedder: no model download, deterministic."""
    from services import embeddings

    monkeypatch.setenv("EMBEDDING_BACKEND", "hashing")
    monkeypatch.setattr(embeddings, "_embedder", None)
    return db
