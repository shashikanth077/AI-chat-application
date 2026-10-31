import { describe, expect, it, vi } from 'vitest';
import { drainFrames, handleFrame } from './sse';
import type { StreamHandlers, StreamState } from './sse';

function setup() {
  const handlers: StreamHandlers = { onDelta: vi.fn(), onSources: vi.fn() };
  const state: StreamState = { finished: false };
  return { handlers, state };
}

describe('drainFrames', () => {
  it('returns complete frames and keeps the unfinished tail', () => {
    const { frames, rest } = drainFrames('data: {"delta":"a"}\n\ndata: {"delta":"b"}\n\ndata: {"del');
    expect(frames).toEqual(['data: {"delta":"a"}', 'data: {"delta":"b"}']);
    expect(rest).toBe('data: {"del');
  });
  it('reassembles a frame that arrives split across reads', () => {
    let buffer = '';
    const seen: string[] = [];
    for (const read of ['data: {"delta": "He', 'llo"}\n', '\ndata: {"delta": "!"}\n\n']) {
      const { frames, rest } = drainFrames(buffer + read);
      seen.push(...frames);
      buffer = rest;
    }
    expect(seen).toEqual(['data: {"delta": "Hello"}', 'data: {"delta": "!"}']);
    expect(buffer).toBe('');
  });
  it('returns nothing for an incomplete buffer', () => {
    expect(drainFrames('data: partial')).toEqual({ frames: [], rest: 'data: partial' });
  });
});

describe('handleFrame', () => {
  it('passes text deltas through, including newlines inside the text', () => {
    const { handlers, state } = setup();
    handleFrame('data: {"delta": "line one\\nline two"}', handlers, state);
    expect(handlers.onDelta).toHaveBeenCalledWith('line one\nline two');
  });
  it('delivers sources, including an empty list ("searched, nothing relevant")', () => {
    const { handlers, state } = setup();
    handleFrame('event: sources\ndata: {"sources":[{"n":1,"filename":"a.txt","position":0,"score":0.5,"text":"t"}]}', handlers, state);
    handleFrame('event: sources\ndata: {"sources": []}', handlers, state);
    expect(handlers.onSources).toHaveBeenNthCalledWith(1, [{ n: 1, filename: 'a.txt', position: 0, score: 0.5, text: 't' }]);
    expect(handlers.onSources).toHaveBeenNthCalledWith(2, []);
    expect(handlers.onDelta).not.toHaveBeenCalled();
  });
  it('marks the stream finished on done', () => {
    const { handlers, state } = setup();
    handleFrame('event: done\ndata: {}', handlers, state);
    expect(state.finished).toBe(true);
    expect(handlers.onDelta).not.toHaveBeenCalled();
  });
  it('throws the server\'s safe message on an error frame', () => {
    const { handlers, state } = setup();
    expect(() => handleFrame('event: error\ndata: {"detail": "Could not reach the AI service."}', handlers, state)).toThrow('Could not reach the AI service.');
    expect(state.finished).toBe(false);
  });
  it('ignores frames with no data and empty deltas', () => {
    const { handlers, state } = setup();
    handleFrame('event: ping', handlers, state);
    handleFrame('data: {"delta": ""}', handlers, state);
    expect(handlers.onDelta).not.toHaveBeenCalled();
  });
});

describe('handleFrame: guardrail', () => {
  it('reports what was masked and what the message now says', () => {
    const { handlers, state } = setup();
    const onGuardrail = vi.fn();
    handleFrame('event: guardrail\ndata: {"redacted":{"EMAIL":1},"content":"mail [REDACTED:EMAIL]"}', { ...handlers, onGuardrail }, state);
    expect(onGuardrail).toHaveBeenCalledExactlyOnceWith({ EMAIL: 1 }, 'mail [REDACTED:EMAIL]');
    expect(handlers.onDelta).not.toHaveBeenCalled();
  });
  it('is ignored when nobody listens', () => {
    const { handlers, state } = setup();
    expect(() => handleFrame('event: guardrail\ndata: {"redacted":{"EMAIL":1},"content":"x"}', handlers, state)).not.toThrow();
  });
});
