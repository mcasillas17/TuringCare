import i18next, { type i18n as I18n } from "i18next";
import { type En, en } from "./en";
import { es } from "./es";

export { en, es };

export const LOCALES = ["en", "es"] as const;
const MAX_BROWSER_LANGUAGE_TAG_LENGTH = 64;

export type Locale = (typeof LOCALES)[number];
export type Messages<T = En> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends Record<string, unknown>
      ? Messages<T[K]>
      : never;
};
type LeafMessageKey<T> = {
  [K in keyof T & string]: T[K] extends string
    ? K
    : T[K] extends Record<string, unknown>
      ? `${K}.${LeafMessageKey<T[K]>}`
      : never;
}[keyof T & string];
export type MessageKey = LeafMessageKey<En>;

const resources = {
  en: { translation: en },
  es: { translation: es },
} as const;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

function supportedLocaleFromBrowserLanguage(language: string): Locale | null {
  if (language.length === 0 || language.length > MAX_BROWSER_LANGUAGE_TAG_LENGTH) return null;

  try {
    const [canonicalLanguage] = Intl.getCanonicalLocales(language);
    const primaryLanguage = canonicalLanguage?.split("-")[0]?.toLowerCase();
    return isLocale(primaryLanguage) ? primaryLanguage : null;
  } catch {
    return null;
  }
}

export function resolveBrowserLocale(
  languages: readonly string[] | string | null | undefined,
): Locale {
  const browserLanguages =
    typeof languages === "string" ? [languages] : Array.isArray(languages) ? languages : [];

  for (const language of browserLanguages) {
    const locale = supportedLocaleFromBrowserLanguage(language);
    if (locale) return locale;
  }

  return "en";
}

export function createI18n(locale: Locale): I18n {
  const instance = i18next.createInstance();

  instance.init({
    lng: locale,
    fallbackLng: "en",
    initImmediate: false,
    showSupportNotice: false,
    interpolation: { escapeValue: false, prefix: "{", suffix: "}" },
    resources,
  });

  return instance;
}

export function translate(
  i18n: Pick<I18n, "t">,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const value = i18n.t(key, vars);

  return typeof value === "string" ? value : key;
}
