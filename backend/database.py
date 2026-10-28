import os
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

# Anchored to this folder so the file is the same wherever uvicorn is started.
DEFAULT_DATABASE_URL = f"sqlite:///{Path(__file__).resolve().parent / 'chat.db'}"


class Base(DeclarativeBase):
    """Parent class of all ORM models."""


def make_engine(url: str) -> Engine:
    is_sqlite = url.startswith("sqlite")
    # FastAPI runs sync routes in a thread pool; SQLite's default forbids a
    # connection being used from another thread than the one that created it.
    engine = create_engine(url, connect_args={"check_same_thread": False} if is_sqlite else {})
    if is_sqlite:

        @event.listens_for(engine, "connect")
        def _enable_foreign_keys(dbapi_connection, _record) -> None:
            # SQLite ignores foreign keys (and ON DELETE CASCADE) unless asked.
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


engine = make_engine(os.getenv("DATABASE_URL") or DEFAULT_DATABASE_URL)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def init_db() -> None:
    import models  # noqa: F401  (importing registers the tables on Base)

    Base.metadata.create_all(engine)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one session per request, always closed."""
    with SessionLocal() as session:
        yield session
