// Shapes returned by the backend (see backend/schemas.py).
export interface DocumentSummary {
  id: string;
  filename: string;
  size_bytes: number;
  chunk_count: number;
  created_at: string;
  // Only on the upload response: what the guardrails masked or flagged.
  redacted?: Record<string, number>;
  warnings?: string[];
}

export interface SearchResult {
  document_id: string;
  filename: string;
  position: number;
  text: string;
  score: number;
}
