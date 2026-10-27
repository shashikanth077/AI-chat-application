import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from './types/chat';
import { isAbortError, streamChat } from './services/chatService';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import './App.css';

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lets the Stop button cancel the in-flight request.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Shared by send and retry: stream a reply to `history` into the list.
  const requestReply = async (history: ChatMessage[]) => {
    setError(null);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const replyId = crypto.randomUUID();
    let started = false;

    try {
      await streamChat(
        history,
        (delta) => {
          if (!started) {
            // The assistant bubble appears with the first token.
            started = true;
            setMessages([...history, { id: replyId, role: 'assistant', content: delta }]);
          } else {
            // Functional update: many deltas can arrive before React re-renders.
            setMessages((prev) =>
              prev.map((m) => (m.id === replyId ? { ...m, content: m.content + delta } : m)),
            );
          }
        },
        controller.signal,
      );
    } catch (e) {
      // Stop is a user choice, not a failure. Any partial text is kept.
      if (!isAbortError(e)) {
        setError(e instanceof Error ? e.message : 'Something went wrong.');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleSend = (text: string) => {
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    // Build the new history up front: state updates are async, so
    // `messages` inside this function would still be the old array.
    const history = [...messages, userMsg];
    setMessages(history);
    void requestReply(history);
  };

  // Retry regenerates the answer to the last user message. If the stream failed
  // midway, a partial assistant bubble exists, so cut back to that user message.
  const handleRetry = () => {
    const lastUser = messages.map((m) => m.role).lastIndexOf('user');
    if (lastUser === -1) return;
    const history = messages.slice(0, lastUser + 1);
    setMessages(history);
    void requestReply(history);
  };

  const handleStop = () => abortRef.current?.abort();

  const handleClear = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>AI Chat</h1>
        <button className="secondary" onClick={handleClear} disabled={loading || messages.length === 0}>
          Clear Chat
        </button>
      </header>
      <MessageList messages={messages} loading={loading} error={error} onRetry={handleRetry} />
      <ChatInput disabled={loading} onSend={handleSend} onStop={handleStop} />
    </div>
  );
}

export default App;
