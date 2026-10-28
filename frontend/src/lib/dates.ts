/**
 * The API sends UTC timestamps, but SQLite drops the "Z", so they arrive like
 * "2026-10-28T09:30:00". JavaScript would read that as LOCAL time and shift
 * every date by the user's UTC offset. Put the "Z" back.
 */
export function parseServerDate(value: string): Date {
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasZone ? value : `${value}Z`);
}

export interface Group<T> {
  label: string;
  items: T[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Buckets items (newest first) into "Today", "Yesterday", "Previous 7 days", "Older". Empty buckets are omitted. */
export function groupByRecency<T extends { updated_at: string }>(items: T[], now: Date = new Date()): Group<T>[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const buckets: Group<T>[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ];
  for (const item of items) {
    const t = parseServerDate(item.updated_at).getTime();
    const index = t >= startOfToday ? 0 : t >= startOfToday - DAY_MS ? 1 : t >= startOfToday - 7 * DAY_MS ? 2 : 3;
    buckets[index].items.push(item);
  }
  return buckets.filter((b) => b.items.length > 0);
}
