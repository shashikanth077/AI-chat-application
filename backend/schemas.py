from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# Limits live in one place so Phase 6 / README can reference them.
MAX_MESSAGE_CHARS = 4000
MAX_HISTORY_MESSAGES = 20


class ChatMessage(BaseModel):
    # Literal: only these exact strings are accepted. The client can never
    # smuggle in a "system" message to override our instructions.
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)

    @field_validator("content")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("content must not be blank")
        return v


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=MAX_HISTORY_MESSAGES)

    @model_validator(mode="after")
    def last_message_is_user(self) -> "ChatRequest":
        if self.messages[-1].role != "user":
            raise ValueError("the last message must have role 'user'")
        return self


class ChatResponse(BaseModel):
    reply: str
