import { type Locale, isLocale } from "@turingcare/i18n";

let activeLocale: Locale | null = null;

export function getActiveLocale(): Locale | null {
  return activeLocale;
}

export function setActiveLocale(locale: Locale): boolean {
  if (!isLocale(locale)) return false;

  activeLocale = locale;
  return true;
}
