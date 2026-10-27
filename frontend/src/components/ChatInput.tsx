import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { MAX_MESSAGE_CHARS } from '../constants';

interface Props {
  disabled: boolean;
  onSend: (text: string) => void;
}

export function ChatInput({ disabled, onSend }: Props) {
  const [text, setText] = useState('');
  const canSend = text.trim().length > 0 && !disabled;

  const submit = () => {
    if (!canSend) return;
    onSend(text.trim());
    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter falls through and inserts a newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="chat-input">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
        rows={2}
        maxLength={MAX_MESSAGE_CHARS}
        aria-label="Message"
      />
      <div className="input-side">
        <span className={`counter ${text.length > MAX_MESSAGE_CHARS * 0.9 ? 'warn' : ''}`}>
          {text.length}/{MAX_MESSAGE_CHARS}
        </span>
        <button onClick={submit} disabled={!canSend}>Send</button>
      </div>
    </div>
  );
}
