export type Role = 'user' | 'assistant';

// A passage from the user's documents that an answer was based on.
export interface Source {
  n: number; // the citation number used in the answer text: [1], [2]
  filename: string;
  position: number;
  score: number;
  text: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  sources?: Source[];
  noMatch?: boolean; // documents were searched but nothing relevant was found
}

// Shapes returned by the backend (see backend/schemas.py).
export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

export interface StoredMessage {
  id: number;
  role: Role;
  content: string;
  client_id: string | null; // the id the client generated for a user message
  sources: Source[];
}

export interface ConversationDetail extends ConversationSummary {
  messages: StoredMessage[];
}
