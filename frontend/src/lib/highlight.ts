import { createElement } from 'react';
import type { ReactNode } from 'react';
import type { Root, RootContent } from 'hast';

type Lowlight = ReturnType<typeof import('lowlight').createLowlight>;

// What people type after the opening fence, mapped to the grammar names.
const ALIASES: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  py: 'python', python3: 'python',
  sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
  html: 'xml', svg: 'xml', xhtml: 'xml',
  yml: 'yaml', md: 'markdown', 'c++': 'cpp', golang: 'go', rs: 'rust',
};

export function normalizeLanguage(language: string): string {
  const key = language.trim().toLowerCase();
  return ALIASES[key] ?? key;
}

let loading: Promise<Lowlight> | null = null;

/**
 * Loads the highlighter on first use only, so pages without code never pay for it.
 * Each grammar is a separate chunk, fetched once and cached.
 */
export function loadLowlight(): Promise<Lowlight> {
  loading ??= (async () => {
    const [{ createLowlight }, js, ts, py, bash, json, xml, css, sql, yaml, md, go, rust, java, c, cpp, diff] = await Promise.all([
      import('lowlight'),
      import('highlight.js/lib/languages/javascript'),
      import('highlight.js/lib/languages/typescript'),
      import('highlight.js/lib/languages/python'),
      import('highlight.js/lib/languages/bash'),
      import('highlight.js/lib/languages/json'),
      import('highlight.js/lib/languages/xml'),
      import('highlight.js/lib/languages/css'),
      import('highlight.js/lib/languages/sql'),
      import('highlight.js/lib/languages/yaml'),
      import('highlight.js/lib/languages/markdown'),
      import('highlight.js/lib/languages/go'),
      import('highlight.js/lib/languages/rust'),
      import('highlight.js/lib/languages/java'),
      import('highlight.js/lib/languages/c'),
      import('highlight.js/lib/languages/cpp'),
      import('highlight.js/lib/languages/diff'),
    ]);
    const lowlight = createLowlight();
    lowlight.register({
      javascript: js.default, typescript: ts.default, python: py.default, bash: bash.default, json: json.default,
      xml: xml.default, css: css.default, sql: sql.default, yaml: yaml.default, markdown: md.default,
      go: go.default, rust: rust.default, java: java.default, c: c.default, cpp: cpp.default, diff: diff.default,
    });
    return lowlight;
  })();
  return loading;
}

/** Highlights code into a tree, or null for an unknown language or any failure (the caller shows plain text). */
export function highlightTree(lowlight: Lowlight, code: string, language: string): Root | null {
  const name = normalizeLanguage(language);
  if (!name || !lowlight.registered(name)) return null;
  try {
    return lowlight.highlight(name, code);
  } catch {
    return null;
  }
}

/**
 * Turns the highlighter's tree into React elements. The code is only ever placed in the page as
 * text nodes inside <span>s, never as HTML, so code from a model or a document can't inject markup.
 */
export function renderTree(nodes: RootContent[]): ReactNode[] {
  return nodes.map((node, i) => {
    if (node.type === 'text') return node.value;
    if (node.type !== 'element') return null;
    const classes = node.properties?.className;
    return createElement(
      'span', // always a span, whatever the tree says
      { key: i, className: Array.isArray(classes) ? classes.join(' ') : undefined },
      ...renderTree(node.children as RootContent[]),
    );
  });
}
