import type { ChatMessage } from '../types/chat';

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFC')
    // Combining marks belong to the letter they follow (é, か゛): treating them as separators chops words apart.
    .replace(/[^\p{Letter}\p{Number}\p{Mark}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'conversation';
}

/** A readable markdown transcript of a conversation, including the sources each answer cited. */
export function toMarkdown(title: string, messages: ChatMessage[], exportedAt: Date = new Date()): string {
  const lines = [`# ${title}`, '', `_Exported from AI Chat on ${exportedAt.toISOString().slice(0, 10)}_`, ''];
  for (const m of messages) {
    lines.push('---', '', m.role === 'user' ? '**You**' : '**Assistant**', '', m.content, '');
    if (m.sources && m.sources.length > 0) {
      lines.push('> **Sources**');
      for (const s of m.sources) lines.push(`> ${s.n}. ${s.filename} (similarity ${s.score.toFixed(2)})`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function downloadText(filename: string, text: string, mime = 'text/markdown'): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
