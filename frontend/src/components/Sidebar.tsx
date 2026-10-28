import { useMemo } from 'react';
import { groupByRecency } from '../lib/dates';
import type { ConversationSummary } from '../types/chat';
import { DocumentsPanel } from './DocumentsPanel';
import { CloseIcon, PlusIcon, SparklesIcon, TrashIcon } from './icons';
import './Sidebar.css';

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  disabled: boolean;
  open: boolean;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function Sidebar({ conversations, activeId, disabled, open, onNewChat, onSelect, onDelete, onClose }: Props) {
  const groups = useMemo(() => groupByRecency(conversations), [conversations]);

  return (
    <>
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Sidebar">
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
        </button>

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
        </nav>

        <DocumentsPanel />
      </aside>
      {open && <div className="backdrop" onClick={onClose} />}
    </>
  );
}
