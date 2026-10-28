import type { Source } from '../types/chat';
import { fetchOrThrow } from './http';

export interface StreamHandlers {
  onDelta: (text: string) => void;
  // Sent once, before the first token, when the user's documents were searched.
  onSources: (sources: Source[]) => void;
}

interface StreamState {
  finished: boolean;
}

// One SSE frame looks like:  "event: error\ndata: {...}"  (event line optional).
function handleFrame(frame: string, handlers: StreamHandlers, state: StreamState): void {
  let event = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7);
    else if (line.startsWith('data: ')) data += line.slice(6);
  }
  if (!data) return;

  const payload = JSON.parse(data) as { delta?: string; detail?: string; sources?: Source[] };
  if (event === 'error') throw new Error(payload.detail ?? 'The response failed.');
  if (event === 'done') state.finished = true;
  else if (event === 'sources') handlers.onSources(payload.sources ?? []);
  else if (payload.delta) handlers.onDelta(payload.delta);
}

/**
 * Sends one new user message to a stored conversation and calls `handlers.onDelta`
 * with each piece of the reply as it arrives (and `onSources` once, first, if the
 * user's documents were searched). The server already has the history,
 * so only the new text goes over the wire. Resolves when the stream completes;
 * rejects on failure, or with an AbortError when `signal` is aborted (Stop).
 *
 * `messageId` identifies this user message. Sending the same id again is a
 * retry: the server won't store the message twice.
 */
export async function streamMessage(
  conversationId: string,
  messageId: string,
  content: string,
  useDocuments: boolean,
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  // Errors before the first token arrive as ordinary HTTP errors with JSON.
  const response = await fetchOrThrow(`/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, client_message_id: messageId, use_documents: useDocuments }),
    signal,
  });
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
      handleFrame(buffer.slice(0, end), handlers, state);
      buffer = buffer.slice(end + 2);
    }
  }

  if (!state.finished) throw new Error('The response was interrupted. Please retry.');
}
