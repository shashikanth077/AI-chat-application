import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from './icons';

// navigator.clipboard only exists in secure contexts (https or localhost); fall back for anything else.
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

interface Props {
  text: string;
  label?: string;
  showLabel?: boolean;
  className?: string;
}

export function CopyButton({ text, label = 'Copy', showLabel = false, className = '' }: Props) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    if (!(await copyText(text))) return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button type="button" className={`copy-btn ${className}`} onClick={() => void copy()} aria-label={copied ? 'Copied' : label} title={label}>
      {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
      {showLabel && <span>{copied ? 'Copied' : label}</span>}
    </button>
  );
}
