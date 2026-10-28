import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../types/chat';
import { slugify, toMarkdown } from './export';

describe('slugify', () => {
  it('makes safe file names', () => {
    expect(slugify('How much do cats sleep?')).toBe('how-much-do-cats-sleep');
    expect(slugify('  ../../etc/passwd  ')).toBe('etc-passwd');
    expect(slugify('Café résumé')).toBe('café-résumé');
    expect(slugify('Cafe\u0301 re\u0301sume\u0301')).toBe('café-résumé'); // decomposed accents: same result, not chopped
  });
  it('keeps non-latin letters and falls back when nothing is left', () => {
    expect(slugify('日本語のチャット')).toBe('日本語のチャット');
    expect(slugify('???')).toBe('conversation');
    expect(slugify('x'.repeat(200)).length).toBe(60);
  });
});

describe('toMarkdown', () => {
  const messages: ChatMessage[] = [
    { id: '1', role: 'user', content: 'How much do cats sleep?' },
    { id: '2', role: 'assistant', content: 'Most of the day [1].', sources: [{ n: 1, filename: 'cats.txt', position: 0, score: 0.7123, text: 't' }] },
  ];
  it('writes a titled transcript with speakers and cited sources', () => {
    const md = toMarkdown('Cats', messages, new Date('2026-10-28T10:00:00Z'));
    expect(md).toBe(
      ['# Cats', '', '_Exported from AI Chat on 2026-10-28_', '', '---', '', '**You**', '', 'How much do cats sleep?', '',
        '---', '', '**Assistant**', '', 'Most of the day [1].', '', '> **Sources**', '> 1. cats.txt (similarity 0.71)', ''].join('\n'),
    );
  });
  it('handles an empty conversation', () => {
    expect(toMarkdown('Empty', [], new Date('2026-01-02T00:00:00Z'))).toContain('# Empty');
  });
});
