// Shapes returned by the backend (see backend/schemas.py).
export interface DocumentSummary {
  id: string;
  filename: string;
  size_bytes: number;
  chunk_count: number;
  created_at: string;
}

export interface SearchResult {
  document_id: string;
  filename: string;
  position: number;
  text: string;
  score: number;
}
