import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, ConversationSummary, Source } from './types/chat';
import { streamMessage } from './services/chatService';
import type { StreamHandlers } from './services/chatService';
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
} from './services/conversationService';
import { isAbortError } from './services/http';
import { AboutDialog } from './components/AboutDialog';
import { ChatInput } from './components/ChatInput';
import { describeRedactions } from './lib/guardrails';
import { GuardrailBlockedError } from './services/http';
import { Header } from './components/Header';
import { MessageList } from './components/MessageList';
import { Sidebar } from './components/Sidebar';
import { DEMO } from './config';
import { DemoBanner } from './components/DemoBanner';
import { useConfirm } from './hooks/useConfirm';
import { useInfo } from './hooks/useInfo';
import { useShortcuts } from './hooks/useShortcuts';
import { useTheme } from './hooks/useTheme';
import { useToast } from './hooks/useToast';
import { downloadText, slugify, toMarkdown } from './lib/export';
import './App.css';

const ACTIVE_KEY = 'activeConversationId';
const DOCS_KEY = 'useDocuments';
const COLLAPSED_KEY = 'sidebarCollapsed';

// localStorage can throw (private mode, blocked storage); it is only a convenience.
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.');
const isMobile = () => window.matchMedia('(max-width: 820px)').matches;

type StartStream = (handlers: StreamHandlers, signal: AbortSignal) => Promise<void>;

function App() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  // True from the start when a chat will be reopened, so the welcome screen doesn't flash first.
  const [opening, setOpening] = useState(() => readStored(ACTIVE_KEY) !== null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSED_KEY) === 'true'); // desktop
  const [aboutOpen, setAboutOpen] = useState(false);
  // A refused message goes back into the box so the user can edit it.
  const [restore, setRestore] = useState<{ text: string; n: number } | undefined>();
  const [useDocuments, setUseDocuments] = useState(() => readStored(DOCS_KEY) !== 'false'); // on unless turned off
  const { theme, toggle: toggleTheme } = useTheme();
  const { confirm, dialog } = useConfirm();
  const toast = useToast();
  const info = useInfo();

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
    setOpening(true);
    try {
      const detail = await getConversation(id);
      if (seq !== openSeq.current) return;
      setActiveId(id);
      writeStored(ACTIVE_KEY, id);
      setMessages(
        detail.messages.map((m) => ({
          // A user message keeps the id the client generated for it, so "regenerate" works after a refresh.
          id: m.role === 'user' && m.client_id ? m.client_id : `db-${m.id}`,
          role: m.role,
          content: m.content,
          sources: m.sources.length > 0 ? m.sources : undefined,
        })),
      );
      setSidebarOpen(false);
    } catch (e) {
      if (seq === openSeq.current) setError(messageOf(e));
    } finally {
      if (seq === openSeq.current) setOpening(false);
    }
  };

  const startNewChat = () => {
    openSeq.current++;
    setOpening(false);
    setActiveId(null);
    writeStored(ACTIVE_KEY, null);
    setMessages([]);
    setError(null);
    setSidebarOpen(false);
  };

  // On first load: fetch saved chats and reopen the one this browser had open (a new visitor starts on the welcome screen).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await listConversations();
        if (cancelled) return;
        setConversations(list);
        const target = list.find((c) => c.id === readStored(ACTIVE_KEY));
        if (target) await openConversation(target.id);
        else setOpening(false);
      } catch (e) {
        if (!cancelled) {
          setError(messageOf(e));
          setOpening(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Shared by send, retry and regenerate: stream a reply into the list.
  // `userId` is the user message this reply answers; `onBlocked` runs if the server refuses that message's content.
  const requestReply = async (start: StartStream, userId: string, onBlocked?: () => void | Promise<void>) => {
    setError(null);
    setLoading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const replyId = crypto.randomUUID();
    let started = false;
    // The sources frame arrives before the first token, so hold it until the bubble exists.
    let sources: Source[] | null = null;

    try {
      await start(
        {
          onSources: (found) => {
            sources = found;
          },
          onGuardrail: (redacted, content) => {
            // Show what was actually saved and sent, not what was typed.
            setMessages((prev) => prev.map((m) => (m.id === userId ? { ...m, content } : m)));
            toast.show(`Masked ${describeRedactions(redacted)} before sending.`, 'info');
          },
          onDelta: (delta) => {
            if (!started) {
              // The assistant bubble appears with the first token.
              started = true;
              const withSources = sources && sources.length > 0 ? sources : undefined;
              const noMatch = sources !== null && sources.length === 0;
              setMessages((prev) => [
                ...prev,
                { id: replyId, role: 'assistant', content: delta, sources: withSources, noMatch },
              ]);
            } else {
              // Functional update: many deltas can arrive before React re-renders.
              setMessages((prev) =>
                prev.map((m) => (m.id === replyId ? { ...m, content: m.content + delta } : m)),
              );
            }
          },
        },
        controller.signal,
      );
    } catch (e) {
      // Stop is a user choice, not a failure. Any partial text is kept.
      if (e instanceof GuardrailBlockedError && onBlocked) {
        await onBlocked(); // finish cleaning up before the list is refreshed below
        toast.show(e.message, 'error');
      } else if (!isAbortError(e)) {
        setError(messageOf(e));
      }
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
    const createdHere = !id;
    if (!id) {
      try {
        // Created on the first message, so "New chat" never leaves empty rows behind.
        const created = await createConversation();
        id = created.id;
        setActiveId(id);
        writeStored(ACTIVE_KEY, id);
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
    void requestReply(
      (handlers, signal) => streamMessage(conversationId, userMsg.id, text, useDocuments, handlers, signal),
      userMsg.id,
      async () => {
        // The message was refused (it held a secret): take it off the screen and back into the box.
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        setRestore((r) => ({ text, n: (r?.n ?? 0) + 1 }));
        if (createdHere) {
          // Don't leave an empty "New chat" behind for a message that was never accepted.
          await deleteConversation(conversationId).catch(() => {});
          setConversations((prev) => prev.filter((c) => c.id !== conversationId));
          setActiveId(null);
          writeStored(ACTIVE_KEY, null);
        }
      },
    );
  };

  // Retry (after an error) and Regenerate (a fresh answer) are the same operation: re-send the last
  // user message with its original id. The server already has it and replaces whatever followed.
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf('user');
  const lastUser = lastUserIndex === -1 ? undefined : messages[lastUserIndex];
  // Messages from before the id was stored can't be re-sent (their id is only a placeholder).
  const canResend = Boolean(activeId && lastUser && !lastUser.id.startsWith('db-'));
  const resendLast = () => {
    if (!activeId || !lastUser) return;
    setMessages(messages.slice(0, lastUserIndex + 1)); // drop the old answer from the screen
    void requestReply(
      (handlers, signal) => streamMessage(activeId, lastUser.id, lastUser.content, useDocuments, handlers, signal),
      lastUser.id,
    );
  };

  const handleStop = () => abortRef.current?.abort();

  const toggleDocuments = (on: boolean) => {
    setUseDocuments(on);
    writeStored(DOCS_KEY, String(on));
  };

  const toggleSidebar = () => {
    if (isMobile()) {
      setSidebarOpen((open) => !open);
    } else {
      setCollapsed((current) => {
        writeStored(COLLAPSED_KEY, String(!current));
        return !current;
      });
    }
  };

  const handleDelete = async (id: string) => {
    const title = conversations.find((c) => c.id === id)?.title ?? 'this conversation';
    const sure = await confirm({
      title: 'Delete conversation?',
      message: `"${title}" and all of its messages will be permanently deleted.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!sure) return;
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === activeId) startNewChat();
      toast.show('Conversation deleted');
    } catch (e) {
      setError(messageOf(e));
    }
  };

  // "Clear chat" removes the open conversation; with none open it just resets.
  const handleClear = () => (activeId ? void handleDelete(activeId) : startNewChat());

  const activeTitle = conversations.find((c) => c.id === activeId)?.title ?? 'New chat';

  const handleExport = () => {
    downloadText(`${slugify(activeTitle)}.md`, toMarkdown(activeTitle, messages));
    toast.show('Chat exported as Markdown');
  };

  useShortcuts({
    newChat: () => !loading && startNewChat(),
    toggleSidebar,
    focusComposer: () => document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus(),
    stop: handleStop,
  });

  const lastMessage = messages[messages.length - 1];
  const canRegenerate = canResend && !loading && !error && lastMessage?.role === 'assistant';

  return (
    <div className={`shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        disabled={loading}
        open={sidebarOpen}
        collapsed={collapsed}
        onNewChat={startNewChat}
        onSelect={(id) => void openConversation(id)}
        onDelete={(id) => void handleDelete(id)}
        onClose={() => setSidebarOpen(false)}
        onAbout={() => setAboutOpen(true)}
      />
      <main className="app">
        {DEMO && <DemoBanner />}
        <Header
          title={activeTitle}
          model={info?.model ?? null}
          provider={info?.provider ?? null}
          useDocuments={useDocuments}
          onToggleDocuments={toggleDocuments}
          theme={theme}
          onToggleTheme={toggleTheme}
          onToggleSidebar={toggleSidebar}
          sidebarVisible={isMobile() ? sidebarOpen : !collapsed}
          onClear={handleClear}
          clearDisabled={loading || (messages.length === 0 && !activeId)}
          onExport={handleExport}
          exportDisabled={messages.length === 0}
          onAbout={() => setAboutOpen(true)}
        />
        <MessageList
          messages={messages}
          loading={loading}
          opening={opening}
          searching={useDocuments}
          error={error}
          demo={DEMO}
          onRetry={error && canResend ? resendLast : undefined}
          onRegenerate={canRegenerate ? resendLast : undefined}
          onSuggest={(prompt) => void handleSend(prompt)}
        />
        <ChatInput disabled={loading} onSend={(t) => void handleSend(t)} onStop={handleStop} restore={restore} />
      </main>
      {dialog}
      {aboutOpen && <AboutDialog info={info} demo={DEMO} onClose={() => setAboutOpen(false)} />}
    </div>
  );
}

export default App;
