export type Role = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
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
}

export interface ConversationDetail extends ConversationSummary {
  messages: StoredMessage[];
}
