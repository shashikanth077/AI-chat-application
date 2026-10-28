import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, ConversationSummary } from './types/chat';
import { streamMessage } from './services/chatService';
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
} from './services/conversationService';
import { isAbortError } from './services/http';
import { MessageList } from './components/MessageList';
import { ChatInput } from './components/ChatInput';
import { Sidebar } from './components/Sidebar';
import './App.css';

const ACTIVE_KEY = 'activeConversationId';

// localStorage can throw (private mode, blocked storage); it is only a convenience.
function readStoredId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}
function writeStoredId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* ignore */
  }
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');

type StartStream = (onDelta: (text: string) => void, signal: AbortSignal) => Promise<void>;

function App() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Lets the Stop button cancel the in-flight request.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  // Guards against an older "open conversation" response arriving after a newer click.
  const openSeq = useRef(0);

  const refreshList = async () => {
    try {
      setConversations(await listConversations());
    } catch {
      /* the sidebar just stays as it was; the chat itself still works */
    }
  };

  const openConversation = async (id: string) => {
    const seq = ++openSeq.current;
    setError(null);
    try {
      const detail = await getConversation(id);
      if (seq !== openSeq.current) return;
      setActiveId(id);
      writeStoredId(id);
      setMessages(detail.messages.map((m) => ({ id: `db-${m.id}`, role: m.role, content: m.content })));
      setSidebarOpen(false);
    } catch (e) {
      if (seq === openSeq.current) setError(messageOf(e));
    }
  };

  const startNewChat = () => {
    openSeq.current++;
    setActiveId(null);
    writeStoredId(null);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
  };

  // On first load: fetch saved chats and reopen the one that was open before.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listConversations();
        if (cancelled) return;
        setConversations(list);
        const target = list.find((c) => c.id === readStoredId()) ?? list[0];
        if (target) await openConversation(target.id);
      } catch (e) {
        if (!cancelled) setError(messageOf(e));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Shared by send and retry: stream a reply into the list.
  const requestReply = async (start: StartStream) => {
    setError(null);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const replyId = crypto.randomUUID();
    let started = false;

    try {
      await start((delta) => {
        if (!started) {
          // The assistant bubble appears with the first token.
          started = true;
          setMessages((prev) => [...prev, { id: replyId, role: 'assistant', content: delta }]);
        } else {
          // Functional update: many deltas can arrive before React re-renders.
          setMessages((prev) =>
            prev.map((m) => (m.id === replyId ? { ...m, content: m.content + delta } : m)),
          );
        }
      }, controller.signal);
    } catch (e) {
      // Stop is a user choice, not a failure. Any partial text is kept.
      if (!isAbortError(e)) setError(messageOf(e));
    } finally {
      setLoading(false);
      abortRef.current = null;
      void refreshList(); // new title / new order
    }
  };

  const handleSend = async (text: string) => {
    setError(null);
    setLoading(true); // also blocks double-sends while the conversation is created
    let id = activeId;
    if (!id) {
      try {
        // Created on the first message, so "New chat" never leaves empty rows behind.
        const created = await createConversation();
        id = created.id;
        setActiveId(id);
        writeStoredId(id);
        setConversations((prev) => [created, ...prev]);
      } catch (e) {
        setError(messageOf(e));
        setLoading(false);
        return;
      }
    }

    // This id travels with the message; re-sending it later is a safe retry.
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    const conversationId = id;
    void requestReply((onDelta, signal) =>
      streamMessage(conversationId, userMsg.id, text, onDelta, signal),
    );
  };

  // Retry re-sends the last user message with the same id. The server already
  // has it (or stores it now) and replaces any partial answer that followed.
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const handleRetry =
    activeId && lastUser
      ? () => {
          const lastIndex = messages.findIndex((m) => m.id === lastUser.id);
          setMessages(messages.slice(0, lastIndex + 1)); // drop the partial bubble
          void requestReply((onDelta, signal) =>
            streamMessage(activeId, lastUser.id, lastUser.content, onDelta, signal),
          );
        }
      : undefined;

  const handleStop = () => abortRef.current?.abort();

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === activeId) startNewChat();
    } catch (e) {
      setError(messageOf(e));
    }
  };

  // "Clear Chat" removes the open conversation; with none open it just resets.
  const handleClear = () => (activeId ? void handleDelete(activeId) : startNewChat());

  return (
    <div className="shell">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        disabled={loading}
        open={sidebarOpen}
        onNewChat={startNewChat}
        onSelect={(id) => void openConversation(id)}
        onDelete={(id) => void handleDelete(id)}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="app">
        <header className="header">
          <button className="secondary menu" onClick={() => setSidebarOpen(true)} aria-label="Open conversations">
            ☰
          </button>
          <h1>AI Chat</h1>
          <button
            className="secondary"
            onClick={handleClear}
            disabled={loading || (messages.length === 0 && !activeId)}
          >
            Clear Chat
          </button>
        </header>
        <MessageList messages={messages} loading={loading} error={error} onRetry={handleRetry} />
        <ChatInput disabled={loading} onSend={(t) => void handleSend(t)} onStop={handleStop} />
      </div>
    </div>
  );
}

export default App;
