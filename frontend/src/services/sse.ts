import type { Source } from '../types/chat';

export interface StreamHandlers {
  onDelta: (text: string) => void;
  // Sent once, before the first token, when the user's documents were searched.
  onSources: (sources: Source[]) => void;
  // Sent once, first, when the server masked personal data in the message. `content` is what it now says.
  onGuardrail?: (redacted: Record<string, number>, content: string) => void;
}

export interface StreamState {
  finished: boolean;
}

/**
 * Splits buffered text into complete SSE frames (each ends with a blank line)
 * and the unfinished remainder. Network reads rarely line up with frames, so
 * the caller keeps `rest` and prepends it to the next read.
 */
export function drainFrames(buffer: string): { frames: string[]; rest: string } {
  const frames: string[] = [];
  let rest = buffer;
  let end: number;
  while ((end = rest.indexOf('\n\n')) !== -1) {
    frames.push(rest.slice(0, end));
    rest = rest.slice(end + 2);
  }
  return { frames, rest };
}

// One SSE frame looks like:  "event: error\ndata: {...}"  (event line optional).
export function handleFrame(frame: string, handlers: StreamHandlers, state: StreamState): void {
  let event = 'message';
  let data = '';
  for (const line of frame.split('\n')) {
    if (line.startsWith('event: ')) event = line.slice(7);
    else if (line.startsWith('data: ')) data += line.slice(6);
  }
  if (!data) return;

  const payload = JSON.parse(data) as {
    delta?: string;
    detail?: string;
    sources?: Source[];
    redacted?: Record<string, number>;
    content?: string;
  };
  if (event === 'error') throw new Error(payload.detail ?? 'The response failed.');
  if (event === 'done') state.finished = true;
  else if (event === 'sources') handlers.onSources(payload.sources ?? []);
  else if (event === 'guardrail') handlers.onGuardrail?.(payload.redacted ?? {}, payload.content ?? '');
  else if (payload.delta) handlers.onDelta(payload.delta);
}
