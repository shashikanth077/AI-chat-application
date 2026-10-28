import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { highlightTree, loadLowlight, normalizeLanguage, renderTree } from './highlight';

describe('normalizeLanguage', () => {
  it('maps common fence labels to grammar names', () => {
    expect(['js', 'TS', 'py', 'sh', 'html', 'yml', 'C++', 'rs', 'python'].map(normalizeLanguage)).toEqual(
      ['javascript', 'typescript', 'python', 'bash', 'xml', 'yaml', 'cpp', 'rust', 'python'],
    );
  });
});

describe('highlighting', () => {
  it('wraps tokens in classed spans for a known language', async () => {
    const lowlight = await loadLowlight();
    const tree = highlightTree(lowlight, 'def add(a, b):\n    return a + b', 'py');
    expect(tree).not.toBeNull();
    const html = renderToStaticMarkup(<code>{renderTree(tree!.children)}</code>);
    expect(html).toContain('class="hljs-keyword"');
    expect(html).toContain('add');
  });

  it('returns null for an unknown or empty language, so the caller falls back to plain text', async () => {
    const lowlight = await loadLowlight();
    expect(highlightTree(lowlight, 'whatever', 'klingon')).toBeNull();
    expect(highlightTree(lowlight, 'whatever', '')).toBeNull();
  });

  it('NEVER turns code into markup: hostile code stays escaped text', async () => {
    const lowlight = await loadLowlight();
    const evil = '<script>alert(1)</script><img src=x onerror="alert(2)">';
    for (const language of ['html', 'js', 'python']) {
      const tree = highlightTree(lowlight, evil, language)!;
      const html = renderToStaticMarkup(<code>{renderTree(tree.children)}</code>);
      expect(html).not.toMatch(/<script|<img/);
      expect(html).toContain('&lt;');
    }
  });

  it('loads the highlighter only once', async () => {
    expect(await loadLowlight()).toBe(await loadLowlight());
  });
});
