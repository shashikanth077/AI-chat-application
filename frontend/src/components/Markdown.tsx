import { isValidElement, memo, useMemo } from 'react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { citationNumber, linkCitations } from '../lib/citations';
import { CopyButton } from './CopyButton';

function codeInfo(children: ReactNode): { text: string; language: string } {
  const child = Array.isArray(children) ? children[0] : children;
  if (isValidElement<{ className?: string; children?: ReactNode }>(child)) {
    const language = /language-([\w+-]+)/.exec(child.props.className ?? '')?.[1] ?? '';
    return { text: String(child.props.children ?? '').replace(/\n$/, ''), language };
  }
  return { text: '', language: '' };
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const { text, language } = codeInfo(children);
  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span>{language || 'code'}</span>
        <CopyButton text={text} label="Copy code" showLabel />
      </div>
      <pre>{children}</pre>
    </div>
  );
}

interface Props {
  text: string;
  sourceCount: number;
  onCite: (n: number) => void;
}

/**
 * Renders a model's reply as markdown. react-markdown builds React elements and
 * never inserts raw HTML, so a reply containing <script> or <img onerror=…> is
 * shown as inert text. Images are dropped entirely (a remote image URL in model
 * output would be a tracking pixel), and links open in a new tab without a referrer.
 */
export const Markdown = memo(function Markdown({ text, sourceCount, onCite }: Props) {
  const components = useMemo<Components>(
    () => ({
      a({ href, children }) {
        const n = citationNumber(href);
        if (n !== null) {
          return (
            <button type="button" className="cite" onClick={() => onCite(n)} aria-label={`Show source ${n}`}>
              {n}
            </button>
          );
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      },
      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
      table: ({ children }) => (
        <div className="table-wrap">
          <table>{children}</table>
        </div>
      ),
    }),
    [onCite],
  );

  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} disallowedElements={['img']} unwrapDisallowed>
        {linkCitations(text, sourceCount)}
      </ReactMarkdown>
    </div>
  );
});
