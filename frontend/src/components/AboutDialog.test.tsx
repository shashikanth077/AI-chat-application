import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Info } from '../types/info';
import { AboutDialog } from './AboutDialog';

const info: Info = {
  app: 'AI Chat', version: '1.0.0', demo: false, model: 'llama-3.3-70b', provider: 'api.groq.com',
  embedding_backend: 'fastembed', embedding_model: 'BAAI/bge-small-en-v1.5',
  limits: { max_message_chars: 4000, history_messages: 20, max_upload_bytes: 2_000_000, max_documents: 50 },
};

describe('AboutDialog', () => {
  it('is an accessible dialog that closes with the button, Escape, or a click outside', async () => {
    const onClose = vi.fn();
    render(<AboutDialog info={info} demo={false} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'AI Chat' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(document.querySelector('.modal-backdrop') as HTMLElement);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('shows what this deployment is running (and nothing secret)', () => {
    render(<AboutDialog info={info} demo={false} onClose={vi.fn()} />);
    expect(screen.getByText('Full stack')).toBeInTheDocument();
    expect(screen.getByText('llama-3.3-70b')).toBeInTheDocument();
    expect(screen.getByText('api.groq.com')).toBeInTheDocument();
    expect(screen.getByText('BAAI/bge-small-en-v1.5')).toBeInTheDocument();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
  });

  it('in demo mode says so plainly and does not pretend to show a model', () => {
    render(<AboutDialog info={{ ...info, demo: true, model: 'demo-simulator' }} demo onClose={vi.fn()} />);
    expect(screen.getByText('Live demo')).toBeInTheDocument();
    expect(screen.getByText(/simulated in your browser/)).toBeInTheDocument();
    expect(screen.queryByText('This deployment')).not.toBeInTheDocument();
  });

  it('lists the keyboard shortcuts and links to the source', () => {
    render(<AboutDialog info={null} demo={false} onClose={vi.fn()} />);
    expect(screen.getByText('Start a new chat')).toBeInTheDocument();
    expect(screen.getByText('Stop generating')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /View source on GitHub/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('github.com'));
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('keeps Tab focus inside the dialog', async () => {
    render(<AboutDialog info={info} demo={false} onClose={vi.fn()} />);
    const focusables = screen.getByRole('dialog').querySelectorAll('button, a[href]');
    const last = focusables[focusables.length - 1] as HTMLElement;
    last.focus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });
});
