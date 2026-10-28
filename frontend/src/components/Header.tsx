import { MenuIcon, MoonIcon, SunIcon, TrashIcon } from './icons';
import './Header.css';

interface Props {
  title: string;
  useDocuments: boolean;
  onToggleDocuments: (on: boolean) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSidebar: () => void;
  onClear: () => void;
  clearDisabled: boolean;
}

export function Header({ title, useDocuments, onToggleDocuments, theme, onToggleTheme, onOpenSidebar, onClear, clearDisabled }: Props) {
  return (
    <header className="header">
      <button className="btn-icon menu-btn" onClick={onOpenSidebar} aria-label="Open conversations">
        <MenuIcon size={20} />
      </button>
      <h1 title={title}>{title}</h1>

      <button
        type="button"
        role="switch"
        aria-checked={useDocuments}
        className={`docs-switch ${useDocuments ? 'on' : ''}`}
        onClick={() => onToggleDocuments(!useDocuments)}
        title="Answer from your uploaded documents and cite them"
      >
        <span className="docs-switch-track" aria-hidden="true">
          <span className="docs-switch-thumb" />
        </span>
        <span className="long">Use my documents</span>
        <span className="short">Docs</span>
      </button>

      <button className="btn-icon" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title="Toggle theme">
        {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
      </button>
      <button className="btn btn-ghost clear-btn" onClick={onClear} disabled={clearDisabled} title="Delete this conversation" aria-label="Clear chat">
        <TrashIcon size={16} />
        <span>Clear chat</span>
      </button>
    </header>
  );
}
