import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../types/chat';
import { AlertIcon, ArrowDownIcon, RetryIcon, SparklesIcon } from './icons';
import { MessageBubble } from './MessageBubble';
import { Welcome } from './Welcome';
import './MessageList.css';

const NEAR_BOTTOM_PX = 120;

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  opening: boolean; // a saved conversation is being fetched
  searching: boolean; // the documents are being searched before the answer starts
  error: string | null;
  demo: boolean;
  onRetry?: () => void; // omitted when there is nothing to retry
  onRegenerate?: () => void; // omitted unless the last answer can be regenerated
  onSuggest: (prompt: string) => void;
}

export function MessageList({ messages, loading, opening, searching, error, demo, onRetry, onRegenerate, onSuggest }: Props) {
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
      <div className="messages" ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-label="Conversation" aria-busy={opening}>
        <div className="thread">
          {opening && (
            <div className="skeleton" aria-label="Loading conversation">
              <div className="sk-line sk-right" />
              <div className="sk-row">
                <div className="sk-avatar" />
                <div className="sk-lines">
                  <div className="sk-line" />
                  <div className="sk-line" />
                  <div className="sk-line sk-short" />
                </div>
              </div>
            </div>
          )}

          {!opening && messages.length === 0 && !loading && <Welcome demo={demo} onSuggest={onSuggest} />}

          {!opening &&
            messages.map((m, i) => {
              const isLast = i === messages.length - 1;
              return (
                <MessageBubble
                  key={m.id}
                  message={m}
                  streaming={loading && isLast && m.role === 'assistant'}
                  onRegenerate={isLast && m.role === 'assistant' ? onRegenerate : undefined}
                />
              );
            })}

          {!opening && waiting && (
            <div className="msg msg-assistant">
              <div className="avatar" aria-hidden="true">
                <SparklesIcon size={16} />
              </div>
              <div className="thinking" role="status">
                <div className="typing" aria-label="Assistant is typing">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="thinking-label">{searching ? 'Searching your documents…' : 'Thinking…'}</span>
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
