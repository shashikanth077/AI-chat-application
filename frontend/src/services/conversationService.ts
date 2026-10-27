import type { ConversationDetail, ConversationSummary } from '../types/chat';
import { fetchOrThrow } from './http';

export async function listConversations(): Promise<ConversationSummary[]> {
  const response = await fetchOrThrow('/conversations');
  return (await response.json()) as ConversationSummary[];
}

export async function createConversation(): Promise<ConversationSummary> {
  const response = await fetchOrThrow('/conversations', { method: 'POST' });
  return (await response.json()) as ConversationSummary;
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const response = await fetchOrThrow(`/conversations/${id}`);
  return (await response.json()) as ConversationDetail;
}

export async function deleteConversation(id: string): Promise<void> {
  await fetchOrThrow(`/conversations/${id}`, { method: 'DELETE' });
}
