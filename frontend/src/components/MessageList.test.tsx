import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../types/chat';
import { MessageList } from './MessageList';

const user = (content: string): ChatMessage => ({ id: `u-${content}`, role: 'user', content });
const bot = (content: string): ChatMessage => ({ id: `a-${content}`, role: 'assistant', content });

const BASE = { messages: [], loading: false, opening: false, searching: false, error: null, demo: false, onSuggest: vi.fn() };

function setup(props: Partial<React.ComponentProps<typeof MessageList>> = {}) {
  const onSuggest = vi.fn();
  const onRetry = vi.fn();
  const utils = render(<MessageList {...BASE} onSuggest={onSuggest} onRetry={onRetry} {...props} />);
  return { onSuggest, onRetry, ...utils };
}

describe('MessageList', () => {
  it('shows the welcome screen with suggestions, and a suggestion sends its prompt', async () => {
    const { onSuggest } = setup();
    expect(screen.getByRole('heading', { name: /How can I help/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Write some code/ }));
    expect(onSuggest).toHaveBeenCalledOnce();
    expect(onSuggest.mock.calls[0][0]).toMatch(/Python function/);
  });

  it('hides the welcome screen once there are messages', () => {
    setup({ messages: [user('hi'), bot('hello')] });
    expect(screen.queryByRole('heading', { name: /How can I help/ })).not.toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
  });

  it('shows typing dots only until the first token arrives', () => {
    const { rerender } = setup({ messages: [user('hi')], loading: true });
    expect(screen.getByLabelText('Assistant is typing')).toBeInTheDocument();
    rerender(<MessageList {...BASE} messages={[user('hi'), bot('Hel')]} loading />);
    expect(screen.queryByLabelText('Assistant is typing')).not.toBeInTheDocument();
  });

  it('puts a caret only on the answer that is still streaming', () => {
    const { container, rerender } = setup({ messages: [user('hi'), bot('Hel')], loading: true });
    expect(container.querySelectorAll('.caret')).toHaveLength(1);
    rerender(<MessageList {...BASE} messages={[user('hi'), bot('Hello')]} />);
    expect(container.querySelectorAll('.caret')).toHaveLength(0);
  });

  it('shows an error with a working Retry, and no Retry when there is nothing to retry', async () => {
    const { onRetry, rerender } = setup({ messages: [user('hi')], error: 'Could not reach the AI service.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the AI service.');
    await userEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalledOnce();
    rerender(<MessageList {...BASE} error="Nope" />);
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
  });

  it('disables Retry while a request is in flight', () => {
    setup({ messages: [user('hi')], loading: true, error: 'x' });
    expect(screen.getByRole('button', { name: /Retry/ })).toBeDisabled();
  });

  it('says what it is waiting on: searching documents or just thinking', () => {
    const { rerender } = setup({ messages: [user('hi')], loading: true });
    expect(screen.getByText('Thinking…')).toBeInTheDocument();
    rerender(<MessageList {...BASE} messages={[user('hi')]} loading searching />);
    expect(screen.getByText('Searching your documents…')).toBeInTheDocument();
  });

  it('shows a loading skeleton instead of the welcome screen while a saved chat is fetched', () => {
    setup({ opening: true });
    expect(screen.getByLabelText('Loading conversation')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /How can I help/ })).not.toBeInTheDocument();
    expect(screen.getByRole('log')).toHaveAttribute('aria-busy', 'true');
  });

  it('offers Regenerate on the LAST answer only', async () => {
    const onRegenerate = vi.fn();
    setup({ messages: [user('q1'), bot('a1'), user('q2'), bot('a2')], onRegenerate });
    const buttons = screen.getAllByRole('button', { name: 'Regenerate response' });
    expect(buttons).toHaveLength(1);
    await userEvent.click(buttons[0]);
    expect(onRegenerate).toHaveBeenCalledOnce();
  });

  it('uses the demo suggestions and wording in demo mode', () => {
    setup({ demo: true });
    expect(screen.getByText(/live demo simulates the AI/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ask the sample documents/ })).toBeInTheDocument();
  });
});
