export interface Suggestion {
  title: string;
  prompt: string;
  icon: 'idea' | 'code' | 'table' | 'plan';
}

export const SUGGESTIONS: Suggestion[] = [
  { icon: 'idea', title: 'Explain a concept', prompt: 'Explain retrieval-augmented generation (RAG) in simple terms, with an example.' },
  { icon: 'code', title: 'Write some code', prompt: 'Write a Python function that merges two sorted lists, with a short explanation.' },
  { icon: 'table', title: 'Compare options', prompt: 'Compare SQLite and PostgreSQL for a small web app. Use a table.' },
  { icon: 'plan', title: 'Plan something', prompt: 'Make a 2-week study plan for learning FastAPI from scratch.' },
];

// In the demo the "AI" is simulated, so the prompts are chosen to show off real features.
export const DEMO_SUGGESTIONS: Suggestion[] = [
  { icon: 'idea', title: 'Ask the sample documents', prompt: 'What is this project built with?' },
  { icon: 'code', title: 'See markdown and code', prompt: 'Show me markdown, a code block and a table.' },
  { icon: 'table', title: 'Learn how RAG works', prompt: 'How does retrieval-augmented generation work in this app?' },
  { icon: 'plan', title: 'Take a tour', prompt: 'What can I do in this demo?' },
];
