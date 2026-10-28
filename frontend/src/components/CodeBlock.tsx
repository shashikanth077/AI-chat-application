import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { highlightTree, loadLowlight, renderTree } from '../lib/highlight';
import { CopyButton } from './CopyButton';

type Lowlight = Awaited<ReturnType<typeof loadLowlight>>;

interface Props {
  text: string;
  language: string;
  /** The plain <code> element, shown until (or instead of) the highlighted version. */
  fallback: ReactNode;
}

export function CodeBlock({ text, language, fallback }: Props) {
  const [lowlight, setLowlight] = useState<Lowlight | null>(null);

  // Only blocks that name a language load the highlighter, and only once for the whole page.
  useEffect(() => {
    if (!language) return;
    let cancelled = false;
    loadLowlight().then((ll) => !cancelled && setLowlight(ll)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [language]);

  const tree = useMemo(() => (lowlight ? highlightTree(lowlight, text, language) : null), [lowlight, text, language]);

  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span>{language || 'code'}</span>
        <CopyButton text={text} label="Copy code" showLabel />
      </div>
      <pre>{tree ? <code className="hljs">{renderTree(tree.children)}</code> : fallback}</pre>
    </div>
  );
}
