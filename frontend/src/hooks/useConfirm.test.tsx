import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useConfirm } from './useConfirm';

function Harness({ onAnswer }: { onAnswer: (answer: boolean) => void }) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      <button onClick={async () => onAnswer(await confirm({ title: 'Delete it?', message: 'This is permanent.', confirmLabel: 'Delete', danger: true }))}>
        ask
      </button>
      {dialog}
    </>
  );
}

async function open() {
  const onAnswer = vi.fn();
  render(<Harness onAnswer={onAnswer} />);
  await userEvent.click(screen.getByRole('button', { name: 'ask' }));
  return { onAnswer, dialog: await screen.findByRole('dialog', { name: 'Delete it?' }) };
}

describe('useConfirm / ConfirmDialog', () => {
  it('is an accessible modal that describes the action and focuses the SAFE choice', async () => {
    const { dialog } = await open();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('This is permanent.');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('resolves true on confirm and removes the dialog', async () => {
    const { onAnswer } = await open();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(onAnswer).toHaveBeenCalledExactlyOnceWith(true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['the Cancel button', () => userEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => userEvent.keyboard('{Escape}')],
    ['clicking outside the dialog', () => userEvent.click(document.querySelector('.modal-backdrop') as HTMLElement)],
  ])('resolves false on %s', async (_name, act) => {
    const { onAnswer } = await open();
    await act();
    await waitFor(() => expect(onAnswer).toHaveBeenCalledExactlyOnceWith(false));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps Tab focus inside the dialog', async () => {
    await open();
    await userEvent.tab(); // Cancel -> Delete
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
    await userEvent.tab(); // wraps around
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await userEvent.tab({ shift: true }); // wraps backwards
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus();
  });
});
