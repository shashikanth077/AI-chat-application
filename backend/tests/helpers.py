import json
from unittest.mock import MagicMock

from openai.types.chat import ChatCompletion, ChatCompletionChunk, ChatCompletionMessage
from openai.types.chat.chat_completion import Choice as CompletionChoice
from openai.types.chat.chat_completion_chunk import Choice, ChoiceDelta


def chunk(text):
    """A real SDK chunk object, because ChatOpenAI parses what the client returns."""
    return ChatCompletionChunk(
        id="c", created=0, model="m", object="chat.completion.chunk",
        choices=[Choice(index=0, delta=ChoiceDelta(content=text))],
    )


def completion(text):
    """A real SDK non-streaming response."""
    return ChatCompletion(
        id="c", created=0, model="m", object="chat.completion",
        choices=[CompletionChoice(index=0, finish_reason="stop", message=ChatCompletionMessage(role="assistant", content=text))],
    )


class FakeStream:
    """Iterable like the SDK stream. `items` may contain exceptions to raise."""

    def __init__(self, items):
        self.items = items
        self.close = MagicMock()

    # ChatOpenAI uses the stream as a context manager and closes it on exit.
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def __iter__(self):
        for item in self.items:
            if isinstance(item, Exception):
                raise item
            yield item


def events(response):
    """Parse an SSE body into [(event, data_dict), ...]."""
    out = []
    for frame in response.text.split("\n\n"):
        if not frame.strip():
            continue
        event, data = "message", {}
        for line in frame.splitlines():
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        out.append((event, data))
    return out
