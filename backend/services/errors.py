SEARCH_UNAVAILABLE = "Document search is unavailable. Turn off 'Use my documents' to chat without it."


class VectorStoreError(Exception):
    """The vector index failed or is not configured. The message is safe to show to the client."""

    def __init__(self, message: str = SEARCH_UNAVAILABLE) -> None:
        super().__init__(message)
        self.message = message
