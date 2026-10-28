import { DownloadIcon, InfoIcon, MoonIcon, PanelLeftIcon, SunIcon, TrashIcon } from './icons';
import { Menu } from './Menu';
import './Header.css';

interface Props {
  title: string;
  model: string | null;
  provider: string | null;
  useDocuments: boolean;
  onToggleDocuments: (on: boolean) => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onToggleSidebar: () => void;
  sidebarVisible: boolean;
  onClear: () => void;
  clearDisabled: boolean;
  onExport: () => void;
  exportDisabled: boolean;
  onAbout: () => void;
}

export function Header(p: Props) {
  return (
    <header className="header">
      <button className="btn-icon" onClick={p.onToggleSidebar} aria-label="Toggle sidebar" aria-expanded={p.sidebarVisible} title="Toggle sidebar">
        <PanelLeftIcon size={19} />
      </button>

      <div className="header-title">
        <h1 title={p.title}>{p.title}</h1>
        {p.model && (
          <span className="model-chip" title={p.provider ? `Served by ${p.provider}` : undefined}>
            {p.model}
          </span>
        )}
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={p.useDocuments}
        className={`docs-switch ${p.useDocuments ? 'on' : ''}`}
        onClick={() => p.onToggleDocuments(!p.useDocuments)}
        title="Answer from your uploaded documents and cite them"
      >
        <span className="docs-switch-track" aria-hidden="true">
          <span className="docs-switch-thumb" />
        </span>
        <span className="long">Use my documents</span>
        <span className="short">Docs</span>
      </button>

      <button className="btn-icon" onClick={p.onToggleTheme} aria-label={p.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title="Toggle theme">
        {p.theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
      </button>

      <button className="btn btn-ghost clear-btn" onClick={p.onClear} disabled={p.clearDisabled} title="Delete this conversation" aria-label="Clear chat">
        <TrashIcon size={16} />
        <span>Clear chat</span>
      </button>

      <Menu
        items={[
          { label: 'Export chat (Markdown)', icon: <DownloadIcon size={16} />, onSelect: p.onExport, disabled: p.exportDisabled },
          { label: 'About & shortcuts', icon: <InfoIcon size={16} />, onSelect: p.onAbout },
        ]}
      />
    </header>
  );
}
