import { useMemo, useState } from 'react';
import { GITHUB_URL } from '../config';
import { groupByRecency } from '../lib/dates';
import { MOD } from '../hooks/useShortcuts';
import type { ConversationSummary } from '../types/chat';
import { DocumentsPanel } from './DocumentsPanel';
import { CloseIcon, GithubIcon, InfoIcon, PlusIcon, SearchIcon, SparklesIcon, TrashIcon } from './icons';
import './Sidebar.css';

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  disabled: boolean;
  open: boolean; // mobile drawer
  collapsed: boolean; // desktop: hidden to give the chat the full width
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onAbout: () => void;
}

export function Sidebar({ conversations, activeId, disabled, open, collapsed, onNewChat, onSelect, onDelete, onClose, onAbout }: Props) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () => (needle ? conversations.filter((c) => c.title.toLowerCase().includes(needle)) : conversations),
    [conversations, needle],
  );
  const groups = useMemo(() => groupByRecency(visible), [visible]);

  return (
    <>
      <aside className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`} aria-label="Sidebar" inert={collapsed && !open ? true : undefined}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <SparklesIcon size={16} />
          </span>
          <span className="brand-name">AI Chat</span>
          <button className="btn-icon close-btn" onClick={onClose} aria-label="Close sidebar">
            <CloseIcon size={18} />
          </button>
        </div>

        <button className="btn btn-primary new-chat" onClick={onNewChat} disabled={disabled}>
          <PlusIcon size={16} /> New chat
          <kbd className="kbd-hint" aria-hidden="true">{MOD}⇧O</kbd>
        </button>

        {conversations.length > 0 && (
          <label className="conv-search">
            <SearchIcon size={14} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
          </label>
        )}

        <nav className="conv-nav" aria-label="Conversations">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="group-label">{group.label}</h2>
              <ul className="conv-list">
                {group.items.map((c) => (
                  <li key={c.id} className={c.id === activeId ? 'active' : ''}>
                    <button
                      className="conv-item"
                      onClick={() => onSelect(c.id)}
                      disabled={disabled}
                      title={c.title}
                      aria-current={c.id === activeId ? 'page' : undefined}
                    >
                      {c.title}
                    </button>
                    <button className="conv-delete btn-icon" onClick={() => onDelete(c.id)} disabled={disabled} aria-label={`Delete ${c.title}`}>
                      <TrashIcon size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {conversations.length === 0 && <p className="empty-list">No saved chats yet. Send a message to start one.</p>}
          {conversations.length > 0 && visible.length === 0 && <p className="empty-list">No chats match “{query}”.</p>}
        </nav>

        <DocumentsPanel />

        <div className="sidebar-foot">
          <a className="foot-link" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
            <GithubIcon size={15} /> GitHub
          </a>
          <button className="foot-link" onClick={onAbout}>
            <InfoIcon size={15} /> About
          </button>
        </div>
      </aside>
      {open && <div className="backdrop" onClick={onClose} />}
    </>
  );
}
