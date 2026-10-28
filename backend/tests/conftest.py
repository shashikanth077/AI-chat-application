import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

# Make `import main` / `import schemas` work when pytest runs from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main  # noqa: E402
from services import openai_service  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


@pytest.fixture
def fake_openai(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Replace the real SDK client so tests never touch the network."""
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_MODEL", "test-model")
    fake = MagicMock()
    fake.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content="  Hello!  "))]
    )
    monkeypatch.setattr(openai_service, "_client", fake)
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
