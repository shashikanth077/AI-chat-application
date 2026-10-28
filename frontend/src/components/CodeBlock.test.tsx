import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CodeBlock } from './CodeBlock';

const fallback = (code: string) => <code>{code}</code>;

describe('CodeBlock', () => {
  it('shows the code immediately, then highlights it once the highlighter has loaded', async () => {
    const { container } = render(<CodeBlock text="def add(a, b):\n    return a + b" language="python" fallback={fallback('x')} />);
    expect(screen.getByText('python')).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.hljs-keyword')).not.toBeNull());
    expect(container.querySelector('.hljs-keyword')).toHaveTextContent('def');
  });

  it('shows plain code, and labels it "code", when no language is given', () => {
    const { container } = render(<CodeBlock text="just text" language="" fallback={fallback('just text')} />);
    expect(screen.getByText('code')).toBeInTheDocument();
    expect(container.querySelector('.hljs-keyword')).toBeNull();
    expect(screen.getByText('just text')).toBeInTheDocument();
  });

  it('keeps unknown languages as plain text', async () => {
    const { container } = render(<CodeBlock text="x = 1" language="klingon" fallback={fallback('x = 1')} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('[class^="hljs-"]')).toBeNull();
    expect(screen.getByText('x = 1')).toBeInTheDocument();
  });

  it('never turns hostile code into markup', async () => {
    const evil = '<script>window.__pwn = 1</script><img src=x onerror="window.__pwn = 2">';
    const { container } = render(<CodeBlock text={evil} language="html" fallback={fallback(evil)} />);
    await waitFor(() => expect(container.querySelector('.hljs')).not.toBeNull());
    expect(container.querySelector('script, img')).toBeNull();
    expect(container.textContent).toContain('<script>window.__pwn = 1</script>');
    expect((window as unknown as { __pwn?: number }).__pwn).toBeUndefined();
  });

  it('copies the raw code (not the highlighted markup)', async () => {
    const calls: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void calls.push(t) }, configurable: true });
    render(<CodeBlock text="print(1)" language="python" fallback={fallback('print(1)')} />);
    screen.getByRole('button', { name: 'Copy code' }).click();
    await waitFor(() => expect(calls).toEqual(['print(1)']));
  });
});
