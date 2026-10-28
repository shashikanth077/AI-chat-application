import { describe, expect, it } from 'vitest';
import { groupByRecency, parseServerDate } from './dates';

describe('parseServerDate', () => {
  it('treats a timestamp without a zone as UTC, not local time', () => {
    expect(parseServerDate('2026-10-28T09:30:00').toISOString()).toBe('2026-10-28T09:30:00.000Z');
  });
  it('keeps microseconds-precision strings from the server', () => {
    expect(parseServerDate('2026-10-28T09:30:00.123456').getTime()).toBe(Date.UTC(2026, 9, 28, 9, 30, 0, 123));
  });
  it('leaves timestamps that already carry a zone alone', () => {
    expect(parseServerDate('2026-10-28T09:30:00Z').toISOString()).toBe('2026-10-28T09:30:00.000Z');
    expect(parseServerDate('2026-10-28T11:30:00+02:00').toISOString()).toBe('2026-10-28T09:30:00.000Z');
  });
});

describe('groupByRecency', () => {
  // A fixed "now" at local noon; item times are built in local time to avoid depending on the machine's zone.
  const now = new Date(2026, 9, 28, 12, 0, 0);
  const at = (daysAgo: number, hour = 9) => {
    const d = new Date(2026, 9, 28 - daysAgo, hour, 0, 0);
    return { id: `d${daysAgo}h${hour}`, updated_at: d.toISOString() };
  };

  it('buckets by calendar day and keeps the order given', () => {
    const items = [at(0, 11), at(0, 1), at(1), at(3), at(6), at(8), at(40)];
    const groups = groupByRecency(items, now);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Previous 7 days', 'Older']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['d0h11', 'd0h1']);
    expect(groups[1].items.map((i) => i.id)).toEqual(['d1h9']);
    expect(groups[2].items.map((i) => i.id)).toEqual(['d3h9', 'd6h9']);
    expect(groups[3].items.map((i) => i.id)).toEqual(['d8h9', 'd40h9']);
  });

  it('omits empty buckets and handles an empty list', () => {
    expect(groupByRecency([at(0)], now).map((g) => g.label)).toEqual(['Today']);
    expect(groupByRecency([], now)).toEqual([]);
  });
});
