import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types/chat';
import { CopyButton } from './CopyButton';
import { InfoIcon, SparklesIcon } from './icons';
import { Markdown } from './Markdown';
import './MessageBubble.css';

interface Props {
  message: ChatMessage;
  streaming?: boolean; // the answer is still being written
}

export const MessageBubble = memo(function MessageBubble({ message, streaming = false }: Props) {
  const [openSource, setOpenSource] = useState<number | null>(null);
  const detail = useRef<HTMLDivElement>(null);
  const sources = message.sources ?? [];
  const opened = sources.find((s) => s.n === openSource);

  // After opening a source (from a chip or an inline [n]), make sure its passage is visible.
  useEffect(() => {
    if (opened) detail.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [opened]);

  // Stable identity: Markdown memoizes its components on this. A new function each render would make
  // React rebuild the whole rendered markdown on every streamed token (and drop text selections).
  const showSource = useCallback((n: number) => setOpenSource((current) => (current === n ? null : n)), []);

  if (message.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="user-bubble">{message.content}</div>
      </div>
    );
  }

  return (
    <div className="msg msg-assistant">
      <div className="avatar" aria-hidden="true">
        <SparklesIcon size={16} />
      </div>
      <div className="msg-body">
        <div className="prose" aria-label="Assistant message">
          <Markdown text={message.content} sourceCount={sources.length} onCite={showSource} />
          {streaming && <span className="caret" aria-hidden="true" />}
        </div>

        {sources.length > 0 && (
          <div className="sources">
            <div className="sources-row">
              <span className="sources-label">Sources</span>
              {sources.map((s) => (
                <button
                  key={s.n}
                  type="button"
                  className="source-chip"
                  aria-expanded={openSource === s.n}
                  aria-controls={`source-${s.n}`}
                  onClick={() => showSource(s.n)}
                  title={`${s.filename} (similarity ${s.score.toFixed(2)})`}
                >
                  <span className="source-n">{s.n}</span>
                  <span className="source-name">{s.filename}</span>
                  <span className="source-score">{s.score.toFixed(2)}</span>
                </button>
              ))}
            </div>
            {opened && (
              <div ref={detail} id={`source-${opened.n}`} className="source-detail" role="region" aria-label={`Source ${opened.n}`}>
                <div className="source-detail-head">
                  <strong>{opened.filename}</strong>
                  <span>
                    passage {opened.position + 1} · similarity {opened.score.toFixed(2)}
                  </span>
                </div>
                <p>{opened.text}</p>
              </div>
            )}
          </div>
        )}

        {message.noMatch && (
          <p className="no-match">
            <InfoIcon size={14} /> Nothing relevant was found in your documents for this question.
          </p>
        )}

        {!streaming && message.content && (
          <div className="msg-actions">
            <CopyButton text={message.content} label="Copy reply" />
          </div>
        )}
      </div>
    </div>
  );
});
