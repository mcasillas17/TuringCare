import { type Locale, en, es, formatDateInUtc, isLocale } from "@turingcare/i18n";

const briefMessages = {
  en: en.brief,
  es: es.brief,
} as const;

function interpolate(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}

export function normalizeBriefLocale(locale: unknown): Locale {
  return isLocale(locale) ? locale : "en";
}

export function briefTitle(locale: unknown) {
  return briefMessages[normalizeBriefLocale(locale)].title;
}

export function sharedBriefTitle(locale: unknown) {
  return briefMessages[normalizeBriefLocale(locale)].sharedTitle;
}

export function briefVersionLabel(locale: unknown) {
  return briefMessages[normalizeBriefLocale(locale)].version;
}

export function briefStatusLabel(status: string, version: number, locale: unknown) {
  const messages = briefMessages[normalizeBriefLocale(locale)];
  const template = status === "finalized" ? messages.finalVersion : messages.draftVersion;
  return interpolate(template, { version });
}

function formatStoredBriefDate(generatedAt: string, locale: Locale) {
  return formatDateInUtc(locale, generatedAt, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function briefGeneratedLabel(generatedAt: string, locale: unknown) {
  const normalized = normalizeBriefLocale(locale);
  const formatted = formatStoredBriefDate(generatedAt, normalized);
  if (!formatted) return "";
  return interpolate(briefMessages[normalized].generatedOn, { date: formatted });
}
