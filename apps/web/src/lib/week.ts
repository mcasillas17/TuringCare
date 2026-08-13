/** Local midnight at the Monday of the given date's week. */
export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (d.getDay() + 6) % 7; // getDay: 0=Sun..6=Sat
  d.setDate(d.getDate() - daysSinceMonday);
  return d;
}

/** A new Date n calendar days after the given date (local time). */
export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** The 7 local days [Mon..Sun] of the week starting at `monday`. */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** ISO instants for the half-open range [monday, monday+7d). */
export function weekBounds(monday: Date): { weekStart: string; weekEnd: string } {
  return { weekStart: monday.toISOString(), weekEnd: addDays(monday, 7).toISOString() };
}

/** Local YYYY-MM-DD key for a date. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local Monday YYYY-MM-DD key for a date's week. */
export function weekKeyOf(date: Date): string {
  return dayKey(mondayOf(date));
}

/** True if both dates fall in the same local Mon–Sun week. */
export function sameWeek(a: Date, b: Date): boolean {
  return mondayOf(a).getTime() === mondayOf(b).getTime();
}

/** True only on an incomplete→complete transition for the current week. */
export function shouldCelebrateWeek(o: {
  prev: boolean | undefined;
  complete: boolean;
  isCurrentWeek: boolean;
}): boolean {
  return o.isCurrentWeek && o.prev === false && o.complete;
}
