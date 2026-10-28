import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertIcon, CheckIcon, InfoIcon } from '../components/icons';
import '../components/Toaster.css';

type Kind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  message: string;
  kind: Kind;
}

const TOAST_MS = 3200;
const MAX_VISIBLE = 3;

const ToastContext = createContext<{ show: (message: string, kind?: Kind) => void }>({ show: () => {} });

/** Short-lived confirmations ("Chat exported") that don't block anything. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<number>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const show = useCallback((message: string, kind: Kind = 'success') => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-(MAX_VISIBLE - 1)), { id, message, kind }]);
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setToasts((current) => current.filter((t) => t.id !== id));
    }, TOAST_MS);
    timers.current.add(timer);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.kind === 'success' ? <CheckIcon size={16} /> : t.kind === 'error' ? <AlertIcon size={16} /> : <InfoIcon size={16} />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
