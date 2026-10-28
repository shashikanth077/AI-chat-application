import type { ChatMessage } from '../types/chat';

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const { sources, noMatch } = message;
  return (
    <div className={`bubble-row ${message.role}`}>
      <div className="bubble-col">
        <div className={`bubble ${message.role}`}>{message.content}</div>
        {sources && sources.length > 0 && (
          <div className="sources" aria-label="Sources">
            <span className="sources-label">Sources</span>
            {sources.map((s) => (
              <details key={s.n} className="source">
                <summary>
                  <span className="cite">[{s.n}]</span> {s.filename}
                  <span className="score" title="Similarity score">{s.score.toFixed(2)}</span>
                </summary>
                <p>{s.text}</p>
              </details>
            ))}
          </div>
        )}
        {noMatch && (
          <p className="no-match">Nothing relevant was found in your documents for this question.</p>
        )}
      </div>
    </div>
  );
}
