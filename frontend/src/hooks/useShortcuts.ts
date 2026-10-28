import { useEffect, useRef } from 'react';

export interface Shortcut {
  keys: string;
  description: string;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

/** Listed in the About dialog, so the help text can never drift from the real bindings below. */
export const SHORTCUTS: Shortcut[] = [
  { keys: `${MOD} + Shift + O`, description: 'Start a new chat' },
  { keys: `${MOD} + B`, description: 'Show or hide the sidebar' },
  { keys: '/', description: 'Focus the message box' },
  { keys: 'Esc', description: 'Stop generating' },
  { keys: 'Enter / Shift + Enter', description: 'Send / new line' },
];

interface Handlers {
  newChat: () => void;
  toggleSidebar: () => void;
  focusComposer: () => void;
  stop: () => void;
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export function useShortcuts(handlers: Handlers) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        latest.current.newChat();
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        latest.current.toggleSidebar();
      } else if (e.key === '/' && !mod && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        latest.current.focusComposer();
      } else if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) {
        latest.current.stop(); // a dialog uses Escape to close itself instead
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
