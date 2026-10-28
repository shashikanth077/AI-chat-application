import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { MAX_MESSAGE_CHARS } from '../constants';
import { SendIcon, StopIcon } from './icons';
import './ChatInput.css';

interface Props {
  disabled: boolean; // a reply is in flight
  onSend: (text: string) => void;
  onStop: () => void;
}

const MAX_HEIGHT_PX = 200;

export function ChatInput({ disabled, onSend, onStop }: Props) {
  const [text, setText] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const canSend = text.trim().length > 0 && !disabled;

  // Grow with the content up to a limit, then scroll.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text]);

  // Return focus to the box when a reply finishes, but only where there's a physical keyboard
  // (focusing on a phone would pop the on-screen keyboard open).
  useEffect(() => {
    if (!disabled && window.matchMedia('(pointer: fine)').matches) field.current?.focus();
  }, [disabled]);

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter falls through and inserts a newline. Ignore Enter while an
    // input method (IME) composition is open: it confirms the composed characters instead.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const nearLimit = text.length > MAX_MESSAGE_CHARS * 0.8;

  return (
    <div className="composer-wrap">
      <div className="composer">
        <textarea
          ref={field}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message AI Chat…"
          rows={1}
          maxLength={MAX_MESSAGE_CHARS}
          aria-label="Message"
        />
        {nearLimit && (
          <span className="char-count" aria-live="polite">
            {text.length}/{MAX_MESSAGE_CHARS}
          </span>
        )}
        {disabled ? (
          <button className="send-btn stop" onClick={onStop} aria-label="Stop generating" title="Stop generating">
            <StopIcon size={16} />
          </button>
        ) : (
          <button className="send-btn" onClick={submit} disabled={!canSend} aria-label="Send message" title="Send (Enter)">
            <SendIcon size={18} />
          </button>
        )}
      </div>
      <p className="composer-hint">AI can make mistakes. Check important information. <span>Enter to send · Shift+Enter for a new line</span></p>
    </div>
  );
}
