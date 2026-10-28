import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoConfig, demoFetch } from './api';
import { resetDemo } from './store';
import { streamMessage } from '../services/chatService';
import type { Source } from '../types/chat';

vi.mock('../config', () => ({ DEMO: true, GITHUB_URL: '', PORTFOLIO_URL: '' }));

const post = (path: string, body: unknown, signal?: AbortSignal) =>
  demoFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });

async function newConversation(): Promise<string> {
  return ((await (await demoFetch('/conversations', { method: 'POST' })).json()) as { id: string }).id;
}

async function ask(id: string, content: string, clientId = crypto.randomUUID(), useDocs = true) {
  let text = '';
  let sources: Source[] | undefined;
  await streamMessage(id, clientId, content, useDocs, {
    onDelta: (d) => (text += d),
    onSources: (s) => (sources = s),
  }, new AbortController().signal);
  return { text, sources, clientId };
}

beforeEach(() => {
  resetDemo();
  localStorage.clear();
  demoConfig.tokenDelayMs = 0;
});

describe('demo backend', () => {
  it('starts with sample documents and reports demo mode', async () => {
    const docs = (await (await demoFetch('/documents')).json()) as { filename: string; chunk_count: number }[];
    expect(docs.map((d) => d.filename)).toContain('RAG explained.md');
    expect(docs.every((d) => d.chunk_count > 0)).toBe(true);
    expect(((await (await demoFetch('/info')).json()) as { demo: boolean }).demo).toBe(true);
  });

  it('streams a cited answer through the real SSE client and stores it', async () => {
    const id = await newConversation();
    const { text, sources } = await ask(id, 'How does RAG retrieve chunks with cosine similarity?');
    expect(sources?.length).toBeGreaterThan(0);
    expect(sources![0].filename).toBe('RAG explained.md');
    expect(text).toMatch(/\[1\]/);

    const conv = (await (await demoFetch(`/conversations/${id}`)).json()) as { title: string; messages: { role: string; sources: Source[] }[] };
    expect(conv.title).toContain('How does RAG');
    expect(conv.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(conv.messages[1].sources.length).toBeGreaterThan(0);
  });

  it('sends no sources frame when documents are off, and an empty one when nothing matches', async () => {
    const id = await newConversation();
    expect((await ask(id, 'hello there', undefined, false)).sources).toBeUndefined();
    expect((await ask(id, 'zzzqqq xylophone', undefined, true)).sources).toEqual([]);
  });

  it('treats a repeated client id as a retry: one user message, fresh answer', async () => {
    const id = await newConversation();
    const first = await ask(id, 'show me markdown');
    await ask(id, 'show me markdown', first.clientId);
    const conv = (await (await demoFetch(`/conversations/${id}`)).json()) as { messages: { role: string; client_id: string | null }[] };
    expect(conv.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(conv.messages[0].client_id).toBe(first.clientId);
  });

  it('keeps the partial answer when stopped', async () => {
    demoConfig.tokenDelayMs = 5;
    const id = await newConversation();
    const ctl = new AbortController();
    let text = '';
    const run = streamMessage(id, 'c1', 'show me markdown code', false, {
      onDelta: (d) => {
        text += d;
        if (text.length > 20) ctl.abort();
      },
      onSources: () => {},
    }, ctl.signal);
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    const conv = (await (await demoFetch(`/conversations/${id}`)).json()) as { messages: { role: string; content: string }[] };
    expect(conv.messages[1].role).toBe('assistant');
    expect(conv.messages[1].content.length).toBeGreaterThan(10);
  });

  it('validates messages and unknown conversations', async () => {
    const id = await newConversation();
    expect((await post(`/conversations/${id}/messages/stream`, { content: '  ', client_message_id: 'x' })).status).toBe(422);
    expect((await post('/conversations/nope/messages/stream', { content: 'hi', client_message_id: 'x' })).status).toBe(404);
  });

  it('accepts small text files, rejects other types, and deletes', async () => {
    const form = new FormData();
    form.append('file', new File(['Dragons breathe fire over mountains.'], 'dragons.txt'));
    const ok = await demoFetch('/documents', { method: 'POST', body: form });
    expect(ok.status).toBe(201);
    const doc = (await ok.json()) as { id: string };

    const pdf = new FormData();
    pdf.append('file', new File(['x'], 'a.pdf'));
    expect((await demoFetch('/documents', { method: 'POST', body: pdf })).status).toBe(415);

    const hits = (await (await post('/documents/search', { query: 'dragons fire' })).json()) as { filename: string }[];
    expect(hits[0].filename).toBe('dragons.txt');

    expect((await demoFetch(`/documents/${doc.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await demoFetch(`/documents/${doc.id}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('deletes a conversation', async () => {
    const id = await newConversation();
    expect((await demoFetch(`/conversations/${id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await demoFetch(`/conversations/${id}`)).status).toBe(404);
  });
});
