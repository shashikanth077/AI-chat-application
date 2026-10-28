import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast } from './useToast';

function Trigger({ message, kind }: { message: string; kind?: 'success' | 'error' | 'info' }) {
  const toast = useToast();
  return <button onClick={() => toast.show(message, kind)}>{message}</button>;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const click = (name: string) => act(() => screen.getByRole('button', { name }).click());

describe('toasts', () => {
  it('shows a message in a polite live region and removes it after a few seconds', () => {
    render(<ToastProvider><Trigger message="Chat exported" /></ToastProvider>);
    click('Chat exported');
    expect(screen.getByRole('status')).toHaveTextContent('Chat exported');
    act(() => vi.advanceTimersByTime(3300));
    expect(screen.getByRole('status')).not.toHaveTextContent('Chat exported');
  });

  it('keeps at most three on screen, dropping the oldest', () => {
    function Many() {
      const toast = useToast();
      return <button onClick={() => ['a', 'b', 'c', 'd'].forEach((m) => toast.show(m))}>go</button>;
    }
    render(<ToastProvider><Many /></ToastProvider>);
    click('go');
    expect(screen.getByRole('status').querySelectorAll('.toast')).toHaveLength(3);
    expect(screen.getByRole('status')).not.toHaveTextContent('a');
    expect(screen.getByRole('status')).toHaveTextContent('d');
  });

  it('styles by kind', () => {
    render(<ToastProvider><Trigger message="Oops" kind="error" /></ToastProvider>);
    click('Oops');
    expect(document.querySelector('.toast-error')).not.toBeNull();
  });

  it('does nothing (and does not crash) when used outside a provider', () => {
    render(<Trigger message="x" />);
    expect(() => click('x')).not.toThrow();
  });

  it('cancels pending timers on unmount', () => {
    const { unmount } = render(<ToastProvider><Trigger message="bye" /></ToastProvider>);
    click('bye');
    unmount();
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });
});
