import type { ConversationSummary } from '../types/chat';
import { DocumentsPanel } from './DocumentsPanel';

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

export function Sidebar({
  conversations, activeId, disabled, open, onNewChat, onSelect, onDelete, onClose,
}: Props) {
  return (
    <>
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Conversations">
        <button className="new-chat" onClick={onNewChat} disabled={disabled}>+ New chat</button>
        <ul className="conv-list">
          {conversations.map((c) => (
            <li key={c.id} className={c.id === activeId ? 'active' : ''}>
              <button
                className="conv-title"
                onClick={() => onSelect(c.id)}
                disabled={disabled}
                title={c.title}
              >
                {c.title}
              </button>
              <button
                className="conv-delete"
                onClick={() => onDelete(c.id)}
                disabled={disabled}
                aria-label={`Delete ${c.title}`}
              >
                ×
              </button>
            </li>
          ))}
          {conversations.length === 0 && <li className="empty-list">No saved chats yet.</li>}
        </ul>
        <DocumentsPanel />
      </aside>
      {open && <div className="backdrop" onClick={onClose} />}
    </>
  );
}
