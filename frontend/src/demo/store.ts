// All demo data lives in this browser's localStorage, so visitors never share
// anything and nothing is sent to a server.
import type { Source } from '../types/chat';

export interface DemoMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  client_id: string | null;
  sources: Source[];
}
export interface DemoConversation {
  id: string;
  title: string;
  updated_at: string;
  messages: DemoMessage[];
}
export interface DemoChunk {
  position: number;
  text: string;
  vector: number[];
}
export interface DemoDocument {
  id: string;
  filename: string;
  size_bytes: number;
  created_at: string;
  chunks: DemoChunk[];
}
export interface DemoState {
  seeded: boolean;
  nextMessageId: number;
  conversations: DemoConversation[];
  documents: DemoDocument[];
}

const KEY = 'ai-chat-demo-v1';
const empty = (): DemoState => ({ seeded: false, nextMessageId: 1, conversations: [], documents: [] });

let cache: DemoState | null = null;

export function load(): DemoState {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? ({ ...empty(), ...(JSON.parse(raw) as DemoState) }) : empty();
  } catch {
    cache = empty();
  }
  return cache;
}

export function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch {
    // Storage full or blocked: the demo keeps working for this tab, it just won't persist.
  }
}

export function resetDemo(): void {
  cache = empty();
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
