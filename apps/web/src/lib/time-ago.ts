import type { MessageKey } from "@/i18n/types";

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** Returns a human-readable relative time string (e.g. "today", "3 days ago"). */
export function timeAgo(t: Translate, iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return t("dogHub.today");
  if (days < 7) return t("dogHub.daysAgo", { n: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t("dogHub.weeksAgo", { n: weeks });
  const months = Math.floor(days / 30);
  return t("dogHub.monthsAgo", { n: Math.max(months, 1) });
}
