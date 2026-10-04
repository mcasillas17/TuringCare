import { translate } from "@/i18n";
import { type Locale, formatDateInUtc, isLocale } from "@turingcare/i18n";

export function normalizeBriefLocale(locale: unknown): Locale {
  return isLocale(locale) ? locale : "en";
}

export function briefTitle(locale: unknown) {
  return translate(normalizeBriefLocale(locale), "brief.title");
}

export function sharedBriefTitle(locale: unknown) {
  return translate(normalizeBriefLocale(locale), "brief.sharedTitle");
}

export function briefVersionLabel(locale: unknown) {
  return translate(normalizeBriefLocale(locale), "brief.version");
}

export function briefStatusLabel(status: string, version: number, locale: unknown) {
  const key = status === "finalized" ? "brief.finalVersion" : "brief.draftVersion";
  return translate(normalizeBriefLocale(locale), key, { version });
}

export function briefGeneratedLabel(generatedAt: string, locale: unknown) {
  const normalized = normalizeBriefLocale(locale);
  const formatted = formatDateInUtc(normalized, generatedAt, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  if (!formatted) return "";
  return translate(normalized, "brief.generatedOn", { date: formatted });
}
