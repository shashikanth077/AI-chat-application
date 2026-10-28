/**
 * Turns "[1]" in an answer into a markdown link "[1](#cite-1)" so it can be
 * rendered as a clickable citation. Only numbers that match an actual source
 * are linked (a model may cite a number that doesn't exist), and text inside
 * code is left alone.
 */
export function linkCitations(text: string, sourceCount: number): string {
  if (sourceCount <= 0) return text;
  // Splitting on a capturing group puts code spans/fences at the odd indexes.
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/\[(\d{1,2})\](?!\()/g, (match, digits: string) => {
            const n = Number(digits);
            return n >= 1 && n <= sourceCount ? `[${n}](#cite-${n})` : match;
          }),
    )
    .join('');
}

/** The source number for a link produced by linkCitations, or null for any other link. */
export function citationNumber(href: string | undefined): number | null {
  const match = href?.match(/^#cite-(\d{1,2})$/);
  return match ? Number(match[1]) : null;
}
