import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, Source } from '../types/chat';
import { MessageBubble } from './MessageBubble';

const reply = (content: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: 'a1', role: 'assistant', content, ...extra });
const source = (n: number, filename = `doc${n}.txt`): Source => ({ n, filename, position: 0, score: 0.5 + n / 100, text: `Passage text from ${filename}` });

afterEach(() => {
  delete (window as unknown as { __x?: number }).__x;
});

describe('user messages', () => {
  it('are shown as plain text, never parsed as markdown or HTML', () => {
    render(<MessageBubble message={{ id: 'u', role: 'user', content: '**not bold** <b>not html</b>' }} />);
    expect(screen.getByText('**not bold** <b>not html</b>')).toBeInTheDocument();
    expect(document.querySelector('b, strong')).toBeNull();
  });
});

describe('assistant markdown', () => {
  it('renders headings, emphasis, lists, code blocks and tables', () => {
    const md = '## Title\n\nSome **bold** text.\n\n- one\n- two\n\n```python\nprint(1)\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |';
    render(<MessageBubble message={reply(md)} />);
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('bold').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('print(1)')).toBeInTheDocument();
    expect(screen.getByText('python')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows hostile HTML as inert text: no script or image elements, no handlers', () => {
    const evil = 'Hi <script>window.__x = 1</script> <img src=x onerror="window.__x = 2"> <iframe src="https://evil.test"></iframe>';
    const { container } = render(<MessageBubble message={reply(evil)} />);
    expect(container.querySelector('script, img, iframe')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect((window as unknown as { __x?: number }).__x).toBeUndefined();
    expect(container).toHaveTextContent('<script>window.__x = 1</script>');
  });

  it('neutralises javascript: links', () => {
    const { container } = render(<MessageBubble message={reply('[click me](javascript:alert(1))')} />);
    expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  });

  it('drops images (a remote image in model output would be a tracking pixel)', () => {
    const { container } = render(<MessageBubble message={reply('![tracker](https://evil.test/p.png)')} />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('opens external links in a new tab without leaking the referrer', () => {
    render(<MessageBubble message={reply('[docs](https://example.com)')} />);
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('citations', () => {
  const withSources = (content: string, n = 2) => reply(content, { sources: Array.from({ length: n }, (_, i) => source(i + 1)) });

  it('turns [n] into a button that opens that source, and a second click closes it', async () => {
    render(<MessageBubble message={withSources('Cats sleep [1] and play [2].')} />);
    const cite = screen.getByRole('button', { name: 'Show source 2' });
    expect(screen.queryByRole('region', { name: 'Source 2' })).not.toBeInTheDocument();
    await userEvent.click(cite);
    expect(screen.getByRole('region', { name: 'Source 2' })).toHaveTextContent('Passage text from doc2.txt');
    await userEvent.click(cite);
    expect(screen.queryByRole('region', { name: 'Source 2' })).not.toBeInTheDocument();
  });

  it('leaves citations that match no source as plain text, and never links inside code', () => {
    render(<MessageBubble message={withSources('See [1] and [9]. Use `xs[2]` here.')} />);
    expect(screen.getAllByRole('button', { name: /Show source/ })).toHaveLength(1);
    expect(screen.getByText(/and \[9\]/)).toBeInTheDocument();
    expect(screen.getByText('xs[2]').tagName).toBe('CODE');
  });

  it('source chips toggle the same panel and report expanded state', async () => {
    render(<MessageBubble message={withSources('Answer.')} />);
    const chip = screen.getByRole('button', { name: /doc1\.txt/ });
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region', { name: 'Source 1' })).toBeInTheDocument();
  });

  it('shows the "nothing relevant" note only when flagged', () => {
    const { rerender } = render(<MessageBubble message={reply('Answer', { noMatch: true })} />);
    expect(screen.getByText(/Nothing relevant was found/)).toBeInTheDocument();
    rerender(<MessageBubble message={reply('Answer')} />);
    expect(screen.queryByText(/Nothing relevant was found/)).not.toBeInTheDocument();
  });
});

describe('rendering stability', () => {
  it('updates the existing DOM as the reply grows instead of rebuilding it (keeps selections, avoids re-render cost)', () => {
    const { container, rerender } = render(<MessageBubble message={reply('```js\nlet a = 1\n```', { sources: [source(1)] })} streaming />);
    const block = container.querySelector('.codeblock');
    expect(block).not.toBeNull();
    rerender(<MessageBubble message={reply('```js\nlet a = 1\nlet b = 2\n```', { sources: [source(1)] })} streaming />);
    expect(container.querySelector('.codeblock')).toBe(block); // the very same element
    expect(container).toHaveTextContent('let b = 2');
  });

  it('keeps the DOM when a citation is opened', async () => {
    const { container } = render(<MessageBubble message={reply('A [1]\n\n```js\nx\n```', { sources: [source(1)] })} />);
    const block = container.querySelector('.codeblock');
    await userEvent.click(screen.getByRole('button', { name: 'Show source 1' }));
    expect(container.querySelector('.codeblock')).toBe(block);
  });
});

describe('copy and streaming', () => {
  it('copies the raw reply text and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<MessageBubble message={reply('Copy **me**')} />);
    await userEvent.click(screen.getByRole('button', { name: 'Copy reply' }));
    expect(writeText).toHaveBeenCalledWith('Copy **me**');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('hides the copy action and shows a caret while the reply is still streaming', () => {
    const { container } = render(<MessageBubble message={reply('Partial answ')} streaming />);
    expect(screen.queryByRole('button', { name: 'Copy reply' })).not.toBeInTheDocument();
    expect(container.querySelector('.caret')).not.toBeNull();
  });
});
