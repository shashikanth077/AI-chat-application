import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

import database
from database import get_db
from models import DEFAULT_TITLE, Conversation, Message, MessageSource
from schemas import (
    MAX_HISTORY_MESSAGES,
    SearchResult,
    ChatMessage,
    ConversationDetail,
    ConversationSummary,
    NewMessageRequest,
)
from services import rag
from services.embeddings import EmbeddingError
from services.openai_service import ChatServiceError, open_reply_stream
from streaming import sse, sse_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/conversations", tags=["conversations"])

MAX_LISTED_CONVERSATIONS = 100
TITLE_MAX_CHARS = 50


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get_or_404(db: Session, conversation_id: str) -> Conversation:
    conversation = db.get(Conversation, conversation_id)
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return conversation


def _make_title(content: str) -> str:
    one_line = " ".join(content.split())
    return one_line if len(one_line) <= TITLE_MAX_CHARS else one_line[: TITLE_MAX_CHARS - 1] + "…"


def _recent_context(db: Session, conversation_id: str) -> list[ChatMessage]:
    """The messages the model will see: the last N stored in the database.

    The server decides the context, never the client, so a client can't
    inject fake assistant turns or inflate the prompt.
    """
    rows = db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.id.desc())
        .limit(MAX_HISTORY_MESSAGES)
    ).all()
    # model_construct skips validation on purpose: this text was produced by
    # us (not the client) and an assistant reply may legitimately be longer
    # than the limit we enforce on user input.
    return [ChatMessage.model_construct(role=r.role, content=r.content) for r in reversed(rows)]


def _save_assistant_message(conversation_id: str, text: str, passages: list[SearchResult] | None = None) -> None:
    if not text.strip():
        return
    # A fresh session: the request's session may already be closed by the
    # time a long-running stream finishes.
    try:
        with database.SessionLocal() as db:
            message = Message(conversation_id=conversation_id, role="assistant", content=text)
            # A snapshot of the passages the answer was based on, numbered as the model saw them.
            message.sources = [
                MessageSource(
                    n=i, document_id=p.document_id, filename=p.filename,
                    position=p.position, score=p.score, text=p.text,
                )
                for i, p in enumerate(passages or [], 1)
            ]
            db.add(message)
            conversation = db.get(Conversation, conversation_id)
            if conversation is not None:  # it may have been deleted mid-stream
                conversation.updated_at = _now()
            db.commit()
    except Exception:
        # Never log `text`: it is user-visible conversation content.
        logger.exception("Failed to save assistant message")


@router.get("", response_model=list[ConversationSummary])
def list_conversations(db: Session = Depends(get_db)) -> list[Conversation]:
    return list(
        db.scalars(
            select(Conversation)
            .order_by(Conversation.updated_at.desc())
            .limit(MAX_LISTED_CONVERSATIONS)
        )
    )


@router.post("", response_model=ConversationSummary, status_code=201)
def create_conversation(db: Session = Depends(get_db)) -> Conversation:
    conversation = Conversation(title=DEFAULT_TITLE)
    db.add(conversation)
    db.commit()
    return conversation


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(conversation_id: str, db: Session = Depends(get_db)) -> Conversation:
    return _get_or_404(db, conversation_id)


@router.delete("/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: str, db: Session = Depends(get_db)) -> Response:
    db.delete(_get_or_404(db, conversation_id))  # messages go with it (cascade)
    db.commit()
    return Response(status_code=204)


@router.post("/{conversation_id}/messages/stream")
def send_message(
    conversation_id: str,
    body: NewMessageRequest,
    db: Session = Depends(get_db),
):
    conversation = _get_or_404(db, conversation_id)

    existing = db.scalar(
        select(Message).where(
            Message.conversation_id == conversation_id,
            Message.client_id == body.client_message_id,
        )
    )
    if existing is not None:
        # A retry of a message we already stored. Drop whatever followed it
        # (a partial or failed answer) and generate the answer again.
        db.execute(
            delete(Message).where(
                Message.conversation_id == conversation_id, Message.id > existing.id
            )
        )
    else:
        if conversation.title == DEFAULT_TITLE:
            conversation.title = _make_title(body.content)
        db.add(
            Message(
                conversation_id=conversation_id,
                role="user",
                content=body.content,
                client_id=body.client_message_id,
            )
        )
    conversation.updated_at = _now()
    db.commit()

    # Errors before the first token are still ordinary HTTP errors. The user's
    # message stays saved, so Retry (same client_message_id) can pick it up.
    context = _recent_context(db, conversation_id)

    passages: list[SearchResult] | None = None
    if body.use_documents:
        try:
            passages = rag.retrieve(db, context[-1].content)  # the newest user message
        except EmbeddingError:
            raise HTTPException(
                status_code=503,
                detail="Document search is unavailable. Turn off 'Use my documents' to chat without it.",
            )
    system_addendum, provider_messages = rag.build_prompt(context, passages)

    try:
        deltas = open_reply_stream(provider_messages, system_addendum)
    except ChatServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)

    # The sources are the first frame, before any text, so the UI can show them
    # as soon as the answer starts. Not sent at all when retrieval did not run.
    preface = None
    if passages is not None:
        preface = [sse(
            {"sources": [{"n": i, "filename": p.filename, "position": p.position, "score": p.score, "text": p.text}
                         for i, p in enumerate(passages, 1)]},
            event="sources",
        )]
    return sse_response(deltas, lambda text: _save_assistant_message(conversation_id, text, passages), preface)
