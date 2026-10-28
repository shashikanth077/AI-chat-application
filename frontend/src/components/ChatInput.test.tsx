import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatInput } from './ChatInput';

function setup(disabled = false) {
  const onSend = vi.fn();
  const onStop = vi.fn();
  render(<ChatInput disabled={disabled} onSend={onSend} onStop={onStop} />);
  return { onSend, onStop, box: screen.getByRole('textbox', { name: 'Message' }) };
}

describe('ChatInput', () => {
  it('sends the trimmed text on Enter and clears the box', async () => {
    const { onSend, box } = setup();
    await userEvent.type(box, '  hello there  {Enter}');
    expect(onSend).toHaveBeenCalledExactlyOnceWith('hello there');
    expect(box).toHaveValue('');
  });

  it('inserts a newline on Shift+Enter instead of sending', async () => {
    const { onSend, box } = setup();
    await userEvent.type(box, 'line one{Shift>}{Enter}{/Shift}line two');
    expect(onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue('line one\nline two');
  });

  it('does not send blank or whitespace-only messages, by Enter or by button', async () => {
    const { onSend, box } = setup();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
    await userEvent.type(box, '   {Enter}');
    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled();
  });

  it('sends with the button too', async () => {
    const { onSend, box } = setup();
    await userEvent.type(box, 'via button');
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(onSend).toHaveBeenCalledExactlyOnceWith('via button');
  });

  it('ignores Enter while an IME composition is open (it confirms the characters instead)', () => {
    const { onSend, box } = setup();
    fireEvent.change(box, { target: { value: 'にほん' } });
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
    expect(box).toHaveValue('にほん');
  });

  it('shows Stop instead of Send while a reply is in flight, and Stop works', async () => {
    const { onStop, onSend } = setup(true);
    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop generating' }));
    expect(onStop).toHaveBeenCalledOnce();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('only shows the character counter near the limit', () => {
    const { box } = setup();
    expect(screen.queryByText(/\/4000/)).not.toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'x'.repeat(3300) } });
    expect(screen.getByText('3300/4000')).toBeInTheDocument();
  });
});
