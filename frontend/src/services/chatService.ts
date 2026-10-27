import { MAX_HISTORY_MESSAGES } from '../constants';
import type { ChatMessage } from '../types/chat';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

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

export function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

interface StreamState {
  finished: boolean;
}

// One SSE frame looks like:  "event: error\ndata: {...}"  (event line optional).
function handleFrame(frame: string, onDelta: (text: string) => void, state: StreamState): void {
  let event = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7);
    else if (line.startsWith('data: ')) data += line.slice(6);
  }
  if (!data) return;

  const payload = JSON.parse(data) as { delta?: string; detail?: string };
  if (event === 'error') throw new Error(payload.detail ?? 'The response failed.');
  if (event === 'done') state.finished = true;
  else if (payload.delta) onDelta(payload.delta);
}

/**
 * Sends the conversation and calls `onDelta` with each piece of text as it
 * arrives. Resolves when the stream completes; rejects on failure, or with an
 * AbortError when `signal` is aborted (the Stop button).
 */
export async function streamChat(
  history: ChatMessage[],
  onDelta: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The backend rejects >20 messages, and every message costs tokens,
      // so send only the most recent window. Drop the client-side `id`.
      body: JSON.stringify({
        messages: history.slice(-MAX_HISTORY_MESSAGES).map(({ role, content }) => ({ role, content })),
      }),
      signal,
    });
  } catch (e) {
    if (isAbortError(e)) throw e;
    // fetch only rejects on network-level failures (server down, CORS block).
    throw new Error('Cannot reach the server. Is the backend running?');
  }

  // Errors before the first token arrive as ordinary HTTP errors with JSON.
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new Error(extractError(body, response.status));
  }
  if (!response.body) throw new Error('The server sent no response body.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state: StreamState = { finished: false };
  let buffer = '';

  // Network chunks don't line up with SSE frames, so buffer and split on the
  // blank line that ends each frame.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      handleFrame(buffer.slice(0, end), onDelta, state);
      buffer = buffer.slice(end + 2);
    }
  }

  if (!state.finished) throw new Error('The response was interrupted. Please retry.');
}
