from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

DEFAULT_TITLE = "New chat"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Conversation(Base):
    __tablename__ = "conversations"

    # A random UUID, not a counter: ids in URLs can't be guessed or enumerated.
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    title: Mapped[str] = mapped_column(String(120), default=DEFAULT_TITLE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.id",
    )


class Message(Base):
    __tablename__ = "messages"
    # Makes "send this user message" idempotent: the same client id can't be
    # stored twice in one conversation, even under concurrent retries.
    __table_args__ = (UniqueConstraint("conversation_id", "client_id"),)

    # Autoincrement id doubles as the order of messages within a conversation.
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[str] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    client_id: Mapped[str | None] = mapped_column(String(64), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")
    # Citations for an assistant answer. Loaded together with the message (one extra query).
    sources: Mapped[list["MessageSource"]] = relationship(
        back_populates="message", cascade="all, delete-orphan", order_by="MessageSource.n", lazy="selectin"
    )


class MessageSource(Base):
    """A snapshot of one passage an answer was based on.

    Copies the text (and has no foreign key to the document) so the citation
    still shows what the answer relied on after the document is deleted.
    """

    __tablename__ = "message_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), index=True)
    n: Mapped[int] = mapped_column(Integer)  # the citation number the model saw: [1], [2], ...
    document_id: Mapped[str | None] = mapped_column(String(36), default=None)
    filename: Mapped[str] = mapped_column(String(255))
    position: Mapped[int] = mapped_column(Integer)
    score: Mapped[float] = mapped_column(Float)
    text: Mapped[str] = mapped_column(Text)

    message: Mapped[Message] = relationship(back_populates="sources")


class Document(Base):
    """An uploaded file that has been split into chunks and embedded."""

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    filename: Mapped[str] = mapped_column(String(255))
    size_bytes: Mapped[int] = mapped_column(Integer)
    chunk_count: Mapped[int] = mapped_column(Integer)
    # Which embedder made the vectors. Vectors from different models are not comparable.
    embedding_model: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    chunks: Mapped[list["Chunk"]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="Chunk.position"
    )


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[str] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer)  # order within the document
    text: Mapped[str] = mapped_column(Text)
    # float32 vector, stored as raw bytes (384 floats = 1536 bytes for the default model)
    embedding: Mapped[bytes] = mapped_column(LargeBinary)

    document: Mapped[Document] = relationship(back_populates="chunks")
