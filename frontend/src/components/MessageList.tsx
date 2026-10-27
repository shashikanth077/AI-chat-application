import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types/chat';
import { MessageBubble } from './MessageBubble';

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function MessageList({ messages, loading, error, onRetry }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to the sentinel div whenever content below changes.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, error]);

  return (
    <div className="message-list" role="log" aria-live="polite">
      {messages.length === 0 && (
        <p className="empty">Start the conversation by sending a message.</p>
      )}
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      {loading && (
        <div className="bubble-row assistant">
          <div className="bubble assistant typing" aria-label="Assistant is typing">
            <span /><span /><span />
          </div>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          <button className="secondary" onClick={onRetry} disabled={loading}>Retry</button>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
