import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConversationSummary } from '../types/chat';
import { Sidebar } from './Sidebar';

// The documents panel inside the sidebar talks to the network; it is tested on its own.
vi.mock('../services/documentService', () => ({
  listDocuments: vi.fn().mockResolvedValue([]),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  searchDocuments: vi.fn(),
}));

const NOW = new Date(2026, 9, 28, 12, 0, 0);
const at = (daysAgo: number) => new Date(2026, 9, 28 - daysAgo, 9, 0, 0).toISOString();
const chat = (id: string, title: string, daysAgo: number): ConversationSummary => ({ id, title, updated_at: at(daysAgo) });

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: NOW }));
afterEach(() => vi.useRealTimers());

function setup(props: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const handlers = { onNewChat: vi.fn(), onSelect: vi.fn(), onDelete: vi.fn(), onClose: vi.fn() };
  render(
    <Sidebar
      conversations={[chat('a', 'Cats and sleep', 0), chat('b', 'Python tips', 1), chat('c', 'Old idea', 30)]}
      activeId="b"
      disabled={false}
      open={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('Sidebar', () => {
  it('groups chats under Today / Yesterday / Older and marks the open one', () => {
    setup();
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Today', 'Yesterday', 'Older', 'Documents']);
    expect(screen.getByRole('button', { name: 'Python tips' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Cats and sleep' })).not.toHaveAttribute('aria-current');
  });

  it('selects, deletes and starts a new chat', async () => {
    const h = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Old idea' }));
    expect(h.onSelect).toHaveBeenCalledWith('c');
    await userEvent.click(screen.getByRole('button', { name: 'Delete Cats and sleep' }));
    expect(h.onDelete).toHaveBeenCalledWith('a');
    await userEvent.click(screen.getByRole('button', { name: /New chat/ }));
    expect(h.onNewChat).toHaveBeenCalledOnce();
  });

  it('locks navigation while a reply is streaming (use Stop first)', () => {
    setup({ disabled: true });
    expect(screen.getByRole('button', { name: /New chat/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Old idea' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete Old idea' })).toBeDisabled();
  });

  it('tells a new user how to start', () => {
    setup({ conversations: [], activeId: null });
    expect(screen.getByText(/No saved chats yet/)).toBeInTheDocument();
  });

  it('as a mobile drawer: opens with a backdrop that closes it', async () => {
    const h = setup({ open: true });
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toHaveClass('open');
    const backdrop = document.querySelector('.backdrop') as HTMLElement;
    await userEvent.click(backdrop);
    expect(h.onClose).toHaveBeenCalledOnce();
    await userEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: 'Close sidebar' }));
    expect(h.onClose).toHaveBeenCalledTimes(2);
  });
});
