// Local-time humanized date/time helpers for the journal timeline and capture.

/** Local YYYY-MM-DD key for a date. */
export function localDayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type DayKind = "today" | "yesterday" | "date";

/** Classify a date relative to `now` (local days). */
export function dayKindOf(value: string | Date, now: Date = new Date()): DayKind {
  const d = new Date(value);
  const key = localDayKey(d);
  if (key === localDayKey(now)) return "today";
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (key === localDayKey(y)) return "yesterday";
  return "date";
}

/** "Jun 1" in-year, "Dec 31, 2025" across years. */
export function dateLabel(value: string | Date, now: Date = new Date(), locale = "en"): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  }).format(d);
}

/** "4:05 PM" — localized wall-clock time. */
export function humanTime(value: string | Date, locale = "en"): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(d);
}

/** "YYYY-MM-DDTHH:mm" in LOCAL time, for <input type="datetime-local">. */
export function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type DayGroup<T> = { key: string; kind: DayKind; sample: Date; items: T[] };

/** Group items by local day, newest day first; input order preserved within a day. */
export function groupByDay<T>(
  items: T[],
  getDate: (item: T) => string | Date,
  now: Date = new Date(),
): DayGroup<T>[] {
  const buckets = new Map<string, DayGroup<T>>();
  for (const item of items) {
    const d = new Date(getDate(item));
    const key = localDayKey(d);
    let group = buckets.get(key);
    if (!group) {
      group = { key, kind: dayKindOf(d, now), sample: d, items: [] };
      buckets.set(key, group);
    }
    group.items.push(item);
  }
  return [...buckets.values()].sort((a, b) => b.key.localeCompare(a.key));
}
