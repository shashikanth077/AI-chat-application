import { describe, expect, it } from 'vitest';
import { citationNumber, linkCitations } from './citations';

describe('linkCitations', () => {
  it('links numbers that match a source', () => {
    expect(linkCitations('Cats sleep a lot [1], and play [2].', 2)).toBe('Cats sleep a lot [1](#cite-1), and play [2](#cite-2).');
  });
  it('leaves numbers that have no matching source (a model can invent them)', () => {
    expect(linkCitations('See [1] and [3] and [0].', 2)).toBe('See [1](#cite-1) and [3] and [0].');
  });
  it('does nothing when there are no sources', () => {
    expect(linkCitations('An array a[1] here [1]', 0)).toBe('An array a[1] here [1]');
  });
  it('does not touch code spans or fenced code', () => {
    const text = 'Use `xs[1]` here [1].\n```js\nconst y = ys[2];\n```\nAnd [2].';
    expect(linkCitations(text, 2)).toBe('Use `xs[1]` here [1](#cite-1).\n```js\nconst y = ys[2];\n```\nAnd [2](#cite-2).');
  });
  it('does not double-link an existing markdown link', () => {
    expect(linkCitations('[1](https://example.com) and [1]', 1)).toBe('[1](https://example.com) and [1](#cite-1)');
  });
  it('handles a still-streaming message with an unclosed fence without throwing', () => {
    expect(() => linkCitations('```python\nprint(1)\n[1]', 1)).not.toThrow();
  });
});

describe('citationNumber', () => {
  it('reads the number from our links only', () => {
    expect(citationNumber('#cite-3')).toBe(3);
    expect(citationNumber('https://example.com/#cite-3')).toBeNull();
    expect(citationNumber('#other')).toBeNull();
    expect(citationNumber(undefined)).toBeNull();
  });
});
