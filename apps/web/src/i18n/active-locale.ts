import { type Locale, isLocale } from "@turingcare/i18n";

let activeLocale: Locale | null = null;

export function getActiveLocale(): Locale | null {
  return activeLocale;
}

export function setActiveLocale(locale: unknown): locale is Locale {
  if (!isLocale(locale)) return false;

  activeLocale = locale;
  return true;
}

export function resetActiveLocale(): void {
  activeLocale = null;
}
