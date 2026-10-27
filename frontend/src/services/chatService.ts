import type { ChatMessage } from '../types/chat';

// Phase 2: fake backend. In Phase 5 only this file changes (to a real fetch).
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function sendChat(history: ChatMessage[]): Promise<string> {
  await delay(1000);

  const last = history[history.length - 1]?.content ?? '';
  if (last.toLowerCase().includes('error')) {
    throw new Error('Mock failure: the server could not process your request.');
  }
  return `(mock) You said: "${last}". I have ${history.length} message(s) of context.`;
}
