import type { DocumentSummary, SearchResult } from '../types/documents';
import { fetchOrThrow } from './http';

export async function listDocuments(): Promise<DocumentSummary[]> {
  const response = await fetchOrThrow('/documents');
  return (await response.json()) as DocumentSummary[];
}

export async function uploadDocument(file: File): Promise<DocumentSummary> {
  // FormData sets its own Content-Type (with the multipart boundary), so we must NOT set one.
  const form = new FormData();
  form.append('file', file);
  const response = await fetchOrThrow('/documents', { method: 'POST', body: form });
  return (await response.json()) as DocumentSummary;
}

export async function deleteDocument(id: string): Promise<void> {
  await fetchOrThrow(`/documents/${id}`, { method: 'DELETE' });
}

export async function searchDocuments(query: string, topK = 4): Promise<SearchResult[]> {
  const response = await fetchOrThrow('/documents/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: topK }),
  });
  return (await response.json()) as SearchResult[];
}
