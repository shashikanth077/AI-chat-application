import type { ReactNode } from 'react';
import { DEMO_SUGGESTIONS, SUGGESTIONS } from '../lib/suggestions';
import type { Suggestion } from '../lib/suggestions';
import { CalendarIcon, CodeIcon, LightbulbIcon, SparklesIcon, TableIcon } from './icons';
import './Welcome.css';

const ICONS: Record<Suggestion['icon'], ReactNode> = {
  idea: <LightbulbIcon size={18} />,
  code: <CodeIcon size={18} />,
  table: <TableIcon size={18} />,
  plan: <CalendarIcon size={18} />,
};

const FEATURES = ['Streaming answers', 'Markdown & code', 'Cited answers from your files', 'Light & dark'];

interface Props {
  demo: boolean;
  onSuggest: (prompt: string) => void;
}

export function Welcome({ demo, onSuggest }: Props) {
  const suggestions = demo ? DEMO_SUGGESTIONS : SUGGESTIONS;
  return (
    <div className="welcome">
      <div className="welcome-orb" aria-hidden="true">
        <SparklesIcon size={28} />
      </div>
      <h2>
        How can I help <span className="gradient-text">you today?</span>
      </h2>
      <p>
        {demo
          ? 'This live demo simulates the AI in your browser. Two sample documents are already loaded: ask about them, or upload your own.'
          : 'Ask anything, or upload documents in the sidebar and ask about them. Answers cite their sources.'}
      </p>
      <div className="suggestions">
        {suggestions.map((s) => (
          <button key={s.title} className="suggestion" onClick={() => onSuggest(s.prompt)}>
            <span className="suggestion-icon">{ICONS[s.icon]}</span>
            <strong>{s.title}</strong>
            <span className="suggestion-prompt">{s.prompt}</span>
          </button>
        ))}
      </div>
      <ul className="feature-chips" aria-label="Features">
        {FEATURES.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </div>
  );
}
