"""Turn a follow-up question into a standalone search query.

"What about its size?" embeds badly: the vector has no idea what "its" is.
Before retrieval, a small LangChain chain rewrites the newest question using the
recent conversation. The rewritten text is used ONLY for searching; the model
still receives the user's real message.

It never blocks an answer: if the rewrite fails, is empty, or is too long, the
original question is searched instead.
"""
import logging
import os

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from schemas import MAX_SEARCH_QUERY_CHARS, ChatMessage
from services.llm import get_chat_model

logger = logging.getLogger(__name__)

CONTEXT_MESSAGES = 6      # how much recent conversation the rewriter sees
MAX_CONTEXT_CHARS = 600   # per message: assistant replies can be long
REWRITE_TOKENS = 120

_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "Rewrite the user's LAST message as one standalone search query. Use the earlier messages only to "
        "resolve references such as 'it', 'that', 'the second one'. Do not answer the question. Output only "
        "the query. If the last message is already standalone, repeat it unchanged.",
    ),
    MessagesPlaceholder("history"),
])


def enabled() -> bool:
    return os.getenv("RAG_REWRITE_QUERIES", "true").strip().lower() not in {"0", "false", "no", "off"}


def standalone_question(history: list[ChatMessage]) -> str:
    """`history` ends with the newest user message."""
    question = history[-1].content
    if len(history) < 2 or not enabled():
        return question  # nothing to resolve, so skip the extra model call
    messages: list[BaseMessage] = [
        (HumanMessage if m.role == "user" else AIMessage)(content=m.content[:MAX_CONTEXT_CHARS])
        for m in history[-CONTEXT_MESSAGES:]
    ]
    try:
        chain = _PROMPT | get_chat_model().bind(max_tokens=REWRITE_TOKENS) | StrOutputParser()
        rewritten = " ".join(chain.invoke({"history": messages}).split()).strip("\"'")
    except Exception as exc:  # any failure falls back to the original question
        logger.warning("Query rewrite failed (%s); searching with the original question", type(exc).__name__)
        return question
    return rewritten if 0 < len(rewritten) <= MAX_SEARCH_QUERY_CHARS else question
