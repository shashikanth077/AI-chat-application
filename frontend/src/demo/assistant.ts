// The simulated model for the demo. No network and no API key: it composes a
// reply from the retrieved passages (or a canned one) and streams it word by word.
import type { Source } from '../types/chat';

export const NO_DOCS_NOTE =
  'This is the **demo build**, so the replies are simulated in your browser. ' +
  'The real app streams from an LLM; everything else you see (streaming, markdown, citations, retries) is the real interface.';

const SHOWCASE = `Here is a quick tour of what the interface can render.

## Code with syntax highlighting

\`\`\`python
def fibonacci(n: int) -> list[int]:
    seq = [0, 1]
    while len(seq) < n:
        seq.append(seq[-1] + seq[-2])
    return seq[:n]
\`\`\`

## A table

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Backend | FastAPI, Pydantic, SQLAlchemy |
| Streaming | Server-Sent Events |

- Lists, **bold**, *italic* and \`inline code\`
- Links open safely in a new tab: [the repository](https://github.com/shashikanth077/ai-chat-application)
`;

const GREETING = `Hello! I'm the demo assistant. Try asking *"How does streaming work?"* or *"What is RAG?"* with **Use my documents** switched on, or type **show me markdown** to see rich rendering.`;

/** Sentences of a passage, trimmed of markdown headings. */
function sentences(text: string): string[] {
  return text
    .replace(/^#+\s.*$/gm, '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 20);
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);

/** An extractive answer: the sentences that best overlap the question, cited by passage number. */
function answerFrom(question: string, sources: Source[]): string {
  const q = words(question);
  const scored: { n: number; sentence: string; score: number }[] = [];
  for (const s of sources) {
    for (const sentence of sentences(s.text)) {
      let score = 0;
      for (const w of words(sentence)) if (q.has(w) && w.length > 3) score++;
      scored.push({ n: s.n, sentence, score });
    }
  }
  const picked = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  const chosen = picked.length ? picked : scored.slice(0, 2);
  const body = chosen.map((x) => `${x.sentence.replace(/[.!?]$/, '')} [${x.n}].`).join(' ');
  return `Based on your documents: ${body}\n\n*(Simulated answer: in the real app the model writes this from the same retrieved passages.)*`;
}

/** Questions answered by a canned reply: document search is skipped for them. */
export const isCanned = (question: string): boolean => /\b(markdown|code|table|format|render)/i.test(question) || /^\s*(hi|hello|hey)\b/i.test(question);

/**
 * `sources` is undefined when retrieval did not run, and [] when it ran and found nothing,
 * matching the backend's two cases.
 */
export function composeReply(question: string, sources: Source[] | undefined): string {
  const q = question.toLowerCase();
  if (sources && sources.length > 0) return answerFrom(question, sources);
  if (/\b(markdown|code|table|format|render)/.test(q)) return SHOWCASE;
  if (/^\s*(hi|hello|hey)\b/.test(q)) return GREETING;
  if (sources) {
    return `I couldn't find anything relevant in your documents for that, so I can't cite a source. ${NO_DOCS_NOTE}`;
  }
  return `${NO_DOCS_NOTE}\n\nTry turning on **Use my documents** and asking about the sample files, or upload your own \`.txt\` or \`.md\` file.`;
}

/** Splits a reply into small pieces that keep their whitespace, so streaming looks like tokens. */
export function tokenize(text: string): string[] {
  return text.match(/\s*\S+\s*/g) ?? [];
}
