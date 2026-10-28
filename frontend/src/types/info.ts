// Returned by GET /info (see backend/schemas.py).
export interface Info {
  app: string;
  version: string;
  demo: boolean;
  model: string | null;
  provider: string | null;
  embedding_backend: string;
  embedding_model: string;
  limits: {
    max_message_chars: number;
    history_messages: number;
    max_upload_bytes: number;
    max_documents: number;
  };
}
