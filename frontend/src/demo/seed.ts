// Sample documents the demo starts with, so "Use my documents" works on the first message.
export const SEED_DOCUMENTS: { filename: string; text: string }[] = [
  {
    filename: 'About this project.md',
    text: `# About this project

AI Chat is a full-stack chat application. The frontend is React with TypeScript and Vite. The backend is FastAPI with Pydantic validation and SQLite storage through SQLAlchemy.

Replies are streamed to the browser with Server-Sent Events, so the first words appear while the model is still writing. If a request fails halfway, the user message is already saved, and Retry resends it with the same client message id so it is never stored twice.

The project has a large automated test suite: pytest for the backend, Vitest with Testing Library for the frontend, and Playwright end-to-end tests against a fake streaming provider.`,
  },
  {
    filename: 'RAG explained.md',
    text: `# Retrieval-augmented generation

Retrieval-augmented generation, or RAG, lets a model answer from your own documents. Uploaded files are split into chunks of about 800 characters with a small overlap, so an idea cut at a boundary survives.

Each chunk is turned into an embedding vector. When you ask a question, the question is embedded too, and the chunks with the highest cosine similarity are retrieved. Passages below a relevance threshold are discarded.

The retrieved passages are placed inside a sources block in the prompt and numbered. The model cites them as [1] or [2], and the interface shows each citation with the passage it came from. Documents are untrusted input, so the sources block is escaped and the model is told never to follow instructions found inside it.`,
  },
  {
    filename: 'Streaming and reliability.md',
    text: `# Streaming and reliability

The server sends each piece of text as a Server-Sent Event frame. A final done event marks a complete answer. If the connection drops before it, the interface shows an interrupted-response error and offers Retry.

Pressing Stop aborts the request. The partial answer stays on screen and is saved, because the server stores whatever was streamed when the client went away.

Only the most recent twenty messages are sent to the model as context. The server decides the context, never the client, so a browser cannot inject fake assistant turns.`,
  },
];
