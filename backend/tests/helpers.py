import json
from unittest.mock import MagicMock


def chunk(text):
    return MagicMock(choices=[MagicMock(delta=MagicMock(content=text))])


class FakeStream:
    """Iterable like the SDK stream. `items` may contain exceptions to raise."""

    def __init__(self, items):
        self.items = items
        self.close = MagicMock()

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
