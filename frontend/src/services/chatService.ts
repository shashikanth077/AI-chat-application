import { MAX_HISTORY_MESSAGES } from '../constants';
import type { ChatMessage } from '../types/chat';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface ChatResponse {
  reply: string;
}

// FastAPI returns 422 as { detail: [{ msg, loc, ... }] } and other errors as
// { detail: "text" }. Turn either shape into one readable string.
function extractError(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (first.msg) return `Invalid request: ${first.msg}`;
    }
  }
  return `Request failed (HTTP ${status}).`;
}

export async function sendChat(history: ChatMessage[]): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Send only what the API schema expects: drop the client-side `id`.
      body: JSON.stringify({
        // The backend rejects >20 messages, and every message costs tokens,
        // so send only the most recent window of the conversation.
        messages: history.slice(-MAX_HISTORY_MESSAGES).map(({ role, content }) => ({ role, content })),
      }),
    });
  } catch {
    // fetch only rejects on network-level failures (server down, CORS block).
    throw new Error('Cannot reach the server. Is the backend running?');
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new Error(extractError(body, response.status));
  }

  const data = (await response.json()) as ChatResponse;
  return data.reply;
}
