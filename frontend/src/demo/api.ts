// An in-browser stand-in for the FastAPI backend. `fetchOrThrow` routes here
// when the app is built with VITE_DEMO=true, so every service, the SSE parser
// and the UI run their real code paths against the same request/response shapes.
import type { Info } from '../types/info';
import type { Source } from '../types/chat';
import { composeReply, isCanned, tokenize } from './assistant';
import { chunkText, dot, hashEmbed, MIN_SCORE } from './rag';
import { SEED_DOCUMENTS } from './seed';
import { load, save } from './store';
import type { DemoDocument, DemoState } from './store';

export const demoConfig = { tokenDelayMs: 22 };

const LIMITS = {
  max_message_chars: 4000,
  history_messages: 20,
  max_upload_bytes: 200_000,
  max_documents: 10,
};
const MAX_PASSAGES = 4;
const DEFAULT_TITLE = 'New chat';
const TITLE_MAX = 50;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (status: number, detail: string) => json({ detail }, status);
const noContent = () => new Response(null, { status: 204 });
const newId = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function state(): DemoState {
  const s = load();
  if (!s.seeded) {
    s.seeded = true;
    for (const d of SEED_DOCUMENTS) s.documents.push(makeDocument(d.filename, d.text));
    save();
  }
  return s;
}

function makeDocument(filename: string, text: string): DemoDocument {
  return {
    id: newId(),
    filename,
    size_bytes: new TextEncoder().encode(text).length,
    created_at: now(),
    chunks: chunkText(text).map((t, position) => ({ position, text: t, vector: Array.from(hashEmbed(t)) })),
  };
}

const summarizeDoc = (d: DemoDocument) => ({
  id: d.id,
  filename: d.filename,
  size_bytes: d.size_bytes,
  chunk_count: d.chunks.length,
  created_at: d.created_at,
});

// The 384-slot hashing embedder produces chance matches between unrelated
// words. The demo corpus is tiny, so it also requires a shared content word.
const QUESTION_WORDS = new Set('what how does did why which who when where about many much tell show give with from your you can could would should have this that there their they them then than into over some any'.split(' '));
const contentWords = (s: string) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !QUESTION_WORDS.has(w));

function search(s: DemoState, query: string, topK: number) {
  const q = hashEmbed(query);
  const hits = s.documents.flatMap((d) =>
    d.chunks.map((c) => ({
      document_id: d.id,
      filename: d.filename,
      position: c.position,
      text: c.text,
      score: Math.round(dot(q, Float32Array.from(c.vector)) * 10000) / 10000,
    })),
  );
  return hits.sort((a, b) => b.score - a.score).slice(0, topK);
}

export function demoInfo(): Info {
  return {
    app: 'AI Chat',
    version: '1.0.0',
    demo: true,
    model: 'simulated',
    provider: 'in your browser',
    embedding_backend: 'hashing',
    embedding_model: 'hashing:384',
    limits: LIMITS,
  };
}

function makeTitle(content: string): string {
  const one = content.split(/\s+/).filter(Boolean).join(' ');
  return one.length <= TITLE_MAX ? one : one.slice(0, TITLE_MAX - 1) + '…';
}

function sseFrame(data: unknown, event?: string): string {
  return `${event ? `event: ${event}\n` : ''}data: ${JSON.stringify(data)}\n\n`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function streamReply(conversationId: string, body: { content?: unknown; client_message_id?: unknown; use_documents?: unknown }, signal?: AbortSignal | null): Response {
  const s = state();
  const conv = s.conversations.find((c) => c.id === conversationId);
  if (!conv) return fail(404, 'Conversation not found.');
  const content = typeof body.content === 'string' ? body.content : '';
  const clientId = typeof body.client_message_id === 'string' ? body.client_message_id : '';
  if (!content.trim()) return fail(422, 'Invalid request: message must not be blank.');
  if (content.length > LIMITS.max_message_chars) {
    return fail(422, `Invalid request: message is too long (max ${LIMITS.max_message_chars} characters).`);
  }
  if (!clientId) return fail(422, 'Invalid request: client_message_id is required.');

  // A retry of a stored message drops whatever followed it, then answers again.
  const at = conv.messages.findIndex((m) => m.client_id === clientId);
  if (at !== -1) {
    conv.messages.length = at + 1;
  } else {
    if (conv.title === DEFAULT_TITLE) conv.title = makeTitle(content);
    conv.messages.push({ id: s.nextMessageId++, role: 'user', content, client_id: clientId, sources: [] });
  }
  conv.updated_at = now();
  save();

  let sources: Source[] | undefined;
  if (body.use_documents && s.documents.length > 0 && !isCanned(content)) {
    const asked = new Set(contentWords(content));
    sources = search(s, content, MAX_PASSAGES)
      .filter((p) => p.score >= MIN_SCORE && contentWords(p.text).some((w) => asked.has(w)))
      .map((p, i) => ({ n: i + 1, filename: p.filename, position: p.position, score: p.score, text: p.text }));
  }
  const pieces = tokenize(composeReply(content, sources));
  const encoder = new TextEncoder();
  let text = '';
  let saved = false;
  // Whatever was streamed is kept, however the stream ends (done or Stop).
  const persist = () => {
    if (saved) return;
    saved = true;
    if (!text.trim()) return;
    const live = load().conversations.find((c) => c.id === conversationId);
    if (!live) return; // deleted mid-stream
    live.messages.push({ id: load().nextMessageId++, role: 'assistant', content: text, client_id: null, sources: sources ?? [] });
    live.updated_at = now();
    save();
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const onAbort = () => {
        persist();
        controller.error(new DOMException('Aborted', 'AbortError'));
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        if (sources) controller.enqueue(encoder.encode(sseFrame({ sources }, 'sources')));
        for (const piece of pieces) {
          await sleep(demoConfig.tokenDelayMs);
          if (signal?.aborted) return;
          text += piece;
          controller.enqueue(encoder.encode(sseFrame({ delta: piece })));
        }
        persist();
        controller.enqueue(encoder.encode(sseFrame({}, 'done')));
        controller.close();
      } catch {
        // The stream was already errored by an abort.
      } finally {
        signal?.removeEventListener('abort', onAbort);
      }
    },
    cancel: persist,
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

async function upload(form: FormData): Promise<Response> {
  const s = state();
  const file = form.get('file');
  if (!(file instanceof File)) return fail(422, 'Invalid request: a file is required.');
  const name = (file.name || 'untitled').slice(0, 255);
  if (!/\.(txt|md)$/i.test(name)) return fail(415, 'The demo accepts .txt and .md files (the full app also takes PDFs).');
  if (file.size > LIMITS.max_upload_bytes) return fail(413, `File too large for the demo (max ${LIMITS.max_upload_bytes / 1000} KB).`);
  if (s.documents.length >= LIMITS.max_documents) return fail(409, 'Document limit reached. Delete one first.');
  const text = await file.text();
  if (!text.trim()) return fail(422, 'The file has no readable text.');
  const doc = makeDocument(name, text);
  s.documents.push(doc);
  save();
  return json(summarizeDoc(doc), 201);
}

/** Handles the same routes as backend/main.py. */
export async function demoFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const parts = path.split('?')[0].split('/').filter(Boolean);
  const body = (): Record<string, unknown> => {
    try {
      return JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
    } catch {
      return {};
    }
  };
  const s = state();

  if (parts[0] === 'info' && method === 'GET') return json(demoInfo());

  if (parts[0] === 'conversations') {
    const id = parts[1];
    if (!id) {
      if (method === 'GET') {
        const list = [...s.conversations].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 100);
        return json(list.map(({ id, title, updated_at }) => ({ id, title, updated_at })));
      }
      if (method === 'POST') {
        const conv = { id: newId(), title: DEFAULT_TITLE, updated_at: now(), messages: [] };
        s.conversations.push(conv);
        save();
        return json({ id: conv.id, title: conv.title, updated_at: conv.updated_at }, 201);
      }
    } else if (parts[2] === 'messages' && parts[3] === 'stream' && method === 'POST') {
      return streamReply(id, body(), init.signal);
    } else if (!parts[2]) {
      const conv = s.conversations.find((c) => c.id === id);
      if (!conv) return fail(404, 'Conversation not found.');
      if (method === 'GET') return json(conv);
      if (method === 'DELETE') {
        s.conversations = s.conversations.filter((c) => c.id !== id);
        save();
        return noContent();
      }
    }
  }

  if (parts[0] === 'documents') {
    const id = parts[1];
    if (!id && method === 'GET') return json(s.documents.map(summarizeDoc));
    if (!id && method === 'POST') return upload(init.body as FormData);
    if (id === 'search' && method === 'POST') {
      const b = body();
      const query = typeof b.query === 'string' ? b.query.trim() : '';
      if (!query) return fail(422, 'Invalid request: query must not be blank.');
      return json(search(s, query, Math.min(Number(b.top_k) || 4, 10)));
    }
    if (id && method === 'DELETE') {
      if (!s.documents.some((d) => d.id === id)) return fail(404, 'Document not found.');
      s.documents = s.documents.filter((d) => d.id !== id);
      save();
      return noContent();
    }
  }

  return fail(404, 'Not found.');
}
