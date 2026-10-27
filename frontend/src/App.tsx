import { useState } from 'react';
import type { ChatMessage } from './types/chat';
import { sendChat } from './services/chatService';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import './App.css';

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Shared by send and retry: ask the API for a reply to `history`.
  const requestReply = async (history: ChatMessage[]) => {
    setError(null);
    setLoading(true);
    try {
      const reply = await sendChat(history);
      setMessages([...history, { id: crypto.randomUUID(), role: 'assistant', content: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
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

  // After a failure the user message is still in `messages`, so retrying
  // just re-sends the same history without adding a duplicate.
  const handleRetry = () => void requestReply(messages);

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
      <ChatInput disabled={loading} onSend={handleSend} />
    </div>
  );
}

export default App;
