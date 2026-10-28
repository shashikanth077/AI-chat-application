import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types/chat';
import { AlertIcon, ArrowDownIcon, RetryIcon, SparklesIcon } from './icons';
import { MessageBubble } from './MessageBubble';
import './MessageList.css';

const SUGGESTIONS = [
  { title: 'Explain a concept', prompt: 'Explain retrieval-augmented generation (RAG) in simple terms, with an example.' },
  { title: 'Write some code', prompt: 'Write a Python function that merges two sorted lists, with a short explanation.' },
  { title: 'Compare options', prompt: 'Compare SQLite and PostgreSQL for a small web app. Use a table.' },
  { title: 'Plan something', prompt: 'Make a 2-week study plan for learning FastAPI from scratch.' },
];

const NEAR_BOTTOM_PX = 120;

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  onRetry?: () => void; // omitted when there is nothing to retry
  onSuggest: (prompt: string) => void;
}

export function MessageList({ messages, loading, error, onRetry, onSuggest }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // follow new content only while the reader is at the bottom
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stick.current = near;
    setAtBottom(near);
  };

  const last = messages[messages.length - 1];
  // Sending always jumps to the bottom, even if the reader had scrolled up.
  useLayoutEffect(() => {
    if (last?.role === 'user') stick.current = true;
  }, [last]);

  // While tokens stream, smooth scrolling lags behind the text, so jump instead.
  useEffect(() => {
    if (stick.current) scrollToBottom(loading ? 'auto' : 'smooth');
  }, [messages, loading, error, scrollToBottom]);

  const waiting = loading && last?.role !== 'assistant';

  return (
    <div className="messages-wrap">
      <div className="messages" ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-label="Conversation">
        <div className="thread">
          {messages.length === 0 && !loading && (
            <div className="empty">
              <div className="empty-mark" aria-hidden="true">
                <SparklesIcon size={26} />
              </div>
              <h2>How can I help you today?</h2>
              <p>Ask anything, or upload documents in the sidebar and ask about them.</p>
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s.title} className="suggestion" onClick={() => onSuggest(s.prompt)}>
                    <strong>{s.title}</strong>
                    <span>{s.prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble key={m.id} message={m} streaming={loading && i === messages.length - 1 && m.role === 'assistant'} />
          ))}

          {waiting && (
            <div className="msg msg-assistant">
              <div className="avatar" aria-hidden="true">
                <SparklesIcon size={16} />
              </div>
              <div className="typing" aria-label="Assistant is typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}

          {error && (
            <div className="error-banner" role="alert">
              <AlertIcon size={18} />
              <span>{error}</span>
              {onRetry && (
                <button className="btn btn-sm" onClick={onRetry} disabled={loading}>
                  <RetryIcon size={14} /> Retry
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {!atBottom && (
        <button className="jump-btn" onClick={() => scrollToBottom('smooth')} aria-label="Jump to latest message">
          <ArrowDownIcon size={16} />
        </button>
      )}
    </div>
  );
}
