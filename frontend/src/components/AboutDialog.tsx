import { useRef } from 'react';
import { GITHUB_URL, PORTFOLIO_URL } from '../config';
import { SHORTCUTS } from '../hooks/useShortcuts';
import type { Info } from '../types/info';
import { CloseIcon, ExternalLinkIcon, GithubIcon, SparklesIcon } from './icons';
import { Modal } from './Modal';
import './AboutDialog.css';

const STACK = ['React 19', 'TypeScript', 'Vite', 'FastAPI', 'Pydantic', 'SQLite', 'SQLAlchemy', 'Server-Sent Events', 'RAG', 'Vitest', 'pytest'];

interface Props {
  info: Info | null;
  demo: boolean;
  onClose: () => void;
}

export function AboutDialog({ info, demo, onClose }: Props) {
  const closeButton = useRef<HTMLButtonElement>(null);
  return (
    <Modal labelledBy="about-title" onClose={onClose} initialFocus={closeButton} className="modal-lg about">
      <div className="about-head">
        <span className="brand-mark" aria-hidden="true">
          <SparklesIcon size={18} />
        </span>
        <div>
          <h2 id="about-title">AI Chat</h2>
          <span className={`mode-pill ${demo ? 'demo' : ''}`}>{demo ? 'Live demo' : 'Full stack'}</span>
          {info && <span className="version">v{info.version}</span>}
        </div>
        <button ref={closeButton} className="btn-icon about-close" onClick={onClose} aria-label="Close">
          <CloseIcon size={18} />
        </button>
      </div>

      <p className="about-lead">
        A full-stack AI chat application: a React + TypeScript interface streaming from a FastAPI backend, with saved
        conversations, markdown rendering, and retrieval-augmented answers that cite your own documents.
      </p>

      <h3>How it works</h3>
      <div className="flow" aria-label="Architecture">
        <div className="flow-node"><strong>React</strong><span>streams, renders markdown</span></div>
        <span className="flow-arrow" aria-hidden="true">→</span>
        <div className="flow-node"><strong>FastAPI</strong><span>validates, retrieves, streams</span></div>
        <span className="flow-arrow" aria-hidden="true">→</span>
        <div className="flow-node"><strong>LLM + SQLite</strong><span>answers, remembers</span></div>
      </div>
      {demo && (
        <p className="about-note">
          In this demo the backend and the AI are <strong>simulated in your browser</strong>: nothing is sent anywhere, and your
          chats and files stay on this device. The source repository contains the real FastAPI backend.
        </p>
      )}

      <h3>Built with</h3>
      <ul className="chips">
        {STACK.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>

      {info && !demo && (
        <>
          <h3>This deployment</h3>
          <dl className="facts">
            <dt>Model</dt>
            <dd>{info.model ?? 'not configured'}</dd>
            <dt>Provider</dt>
            <dd>{info.provider ?? 'unknown'}</dd>
            <dt>Embeddings</dt>
            <dd>{info.embedding_model}</dd>
            <dt>Context</dt>
            <dd>last {info.limits.history_messages} messages</dd>
          </dl>
        </>
      )}

      <h3>Keyboard shortcuts</h3>
      <dl className="shortcuts">
        {SHORTCUTS.map((s) => (
          <div key={s.keys}>
            <dt>{s.keys.split(' + ').map((k, i) => (i ? [' + ', <kbd key={k}>{k}</kbd>] : <kbd key={k}>{k}</kbd>))}</dt>
            <dd>{s.description}</dd>
          </div>
        ))}
      </dl>

      <div className="about-links">
        <a className="btn btn-primary" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          <GithubIcon size={16} /> View source on GitHub
        </a>
        {PORTFOLIO_URL && (
          <a className="btn" href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer">
            Portfolio <ExternalLinkIcon size={14} />
          </a>
        )}
      </div>
    </Modal>
  );
}
