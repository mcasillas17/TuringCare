import type { Locale } from "@turingcare/i18n";

/** Relative time ("today", "3 days ago"), bucketed by days/weeks/months. `now` is injectable for tests. */
export function timeAgo(
  locale: Locale,
  iso: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const days = Math.floor((now - ms) / (24 * 60 * 60 * 1000));
  if (days <= 0) return rtf.format(0, "day");
  if (days < 7) return rtf.format(-days, "day");
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return rtf.format(-weeks, "week");
  return rtf.format(-Math.max(Math.floor(days / 30), 1), "month");
}
