import { describe, expect, it } from 'vitest';
import fixture from './guardrails.fixture.json';
import { BLOCKED_SECRET, checkInput, find, looksLikeInjection, redact } from './guardrails';

// guardrails.fixture.json is produced by backend/tools/gen_demo_fixture.py from the Python detectors.
describe('demo guardrails match the Python backend', () => {
  it.each(fixture.cases.map((c, i) => [i, c] as const))('case %i: same findings and redaction', (_i, c) => {
    const found = find(c.text);
    expect(found.map((f) => [f.kind, f.start, f.end])).toEqual(c.findings);
    expect(redact(c.text, found)).toBe(c.redacted);
  });

  it.each(fixture.injection as [string, boolean][])('injection heuristic agrees: %s', (text, expected) => {
    expect(looksLikeInjection(text)).toBe(expected);
  });
});

describe('checkInput (demo policy)', () => {
  it('refuses secrets without repeating them', () => {
    const r = checkInput('my key is sk-proj-abcdefghijklmnopqrstuvwx1234');
    expect(r).toEqual({ blocked: BLOCKED_SECRET });
  });
  it('masks personal data', () => {
    expect(checkInput('mail a@b.com')).toEqual({ text: 'mail [REDACTED:EMAIL]', redacted: { EMAIL: 1 } });
  });
  it('leaves clean text alone', () => {
    expect(checkInput('hello')).toEqual({ text: 'hello', redacted: {} });
  });
});
