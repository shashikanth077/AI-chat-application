import { describe, expect, it } from 'vitest';
import fixture from './parity.fixture.json';
import { chunkText, dot, hashEmbed } from './rag';

// parity.fixture.json is produced by backend/tools/gen_demo_fixture.py from the
// Python implementation. If the Python changes, regenerate it.
describe('demo RAG matches the Python backend', () => {
  it.each(fixture.cases.map((c, i) => [i, c] as const))('chunks case %i identically', (_i, c) => {
    expect(chunkText(c.text)).toEqual(c.chunks);
  });

  it('produces the same document vectors', () => {
    for (const c of fixture.cases) {
      c.vectors.forEach((expected, i) => {
        const got = hashEmbed(c.chunks[i]);
        for (let k = 0; k < expected.length; k++) expect(got[k]).toBeCloseTo(expected[k], 4);
      });
    }
  });

  it('produces the same query vectors, including non-ASCII text', () => {
    for (const q of fixture.queries) {
      const got = hashEmbed(q.text);
      for (let k = 0; k < q.vector.length; k++) expect(got[k]).toBeCloseTo(q.vector[k], 4);
    }
  });

  it('scores shared words above unrelated text', () => {
    const q = hashEmbed('how long do cats sleep');
    expect(dot(q, hashEmbed('Cats sleep a long time each day.'))).toBeGreaterThan(
      dot(q, hashEmbed('Rockets burn liquid oxygen.')),
    );
  });
});
