import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useShortcuts } from './useShortcuts';

function Harness({ handlers, children }: { handlers: Parameters<typeof useShortcuts>[0]; children?: React.ReactNode }) {
  useShortcuts(handlers);
  return <div>{children}</div>;
}

const make = () => ({ newChat: vi.fn(), toggleSidebar: vi.fn(), focusComposer: vi.fn(), stop: vi.fn() });

describe('useShortcuts', () => {
  it('Ctrl/Cmd+Shift+O starts a new chat and Ctrl/Cmd+B toggles the sidebar', () => {
    const h = make();
    render(<Harness handlers={h} />);
    fireEvent.keyDown(document, { key: 'O', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(document, { key: 'o', metaKey: true, shiftKey: true });
    fireEvent.keyDown(document, { key: 'b', ctrlKey: true });
    expect(h.newChat).toHaveBeenCalledTimes(2);
    expect(h.toggleSidebar).toHaveBeenCalledOnce();
  });

  it('"/" focuses the composer, but never steals the key while you are typing', () => {
    const h = make();
    const { container } = render(<Harness handlers={h}><textarea aria-label="t" /></Harness>);
    fireEvent.keyDown(document.body, { key: '/' });
    expect(h.focusComposer).toHaveBeenCalledOnce();
    fireEvent.keyDown(container.querySelector('textarea') as HTMLElement, { key: '/' });
    expect(h.focusComposer).toHaveBeenCalledOnce(); // unchanged: typing a slash in the box is normal text
  });

  it('Escape stops generating, except when a dialog is open (it closes the dialog instead)', () => {
    const h = make();
    render(<Harness handlers={h} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(h.stop).toHaveBeenCalledOnce();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(h.stop).toHaveBeenCalledOnce();
    dialog.remove();
  });

  it('always calls the latest handlers without re-registering', () => {
    const first = make();
    const second = make();
    const { rerender } = render(<Harness handlers={first} />);
    rerender(<Harness handlers={second} />);
    fireEvent.keyDown(document, { key: 'b', ctrlKey: true });
    expect(first.toggleSidebar).not.toHaveBeenCalled();
    expect(second.toggleSidebar).toHaveBeenCalledOnce();
  });

  it('leaves ordinary shortcuts alone (copy, paste, a plain B)', () => {
    const h = make();
    render(<Harness handlers={h} />);
    fireEvent.keyDown(document, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(document, { key: 'b' });
    expect(h.toggleSidebar).not.toHaveBeenCalled();
    expect(h.newChat).not.toHaveBeenCalled();
  });
});
