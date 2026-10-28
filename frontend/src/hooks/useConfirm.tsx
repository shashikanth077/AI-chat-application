import { useCallback, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

/**
 * An awaitable replacement for window.confirm:
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ title, message }))) return;
 * Render `dialog` somewhere in the component's output.
 */
export function useConfirm() {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (answer: boolean) => void }) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const answer = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  const dialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      danger={pending.danger}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  ) : null;

  return { confirm, dialog };
}
