import i18next, { type i18n as I18n } from "i18next";
import { en, type En } from "./en";
import { es } from "./es";

export { en, es };

export const LOCALES = ["en", "es"] as const;

export type Locale = (typeof LOCALES)[number];
export type Messages = { [S in keyof En]: { [K in keyof En[S]]: string } };
export type MessageKey = {
  [S in keyof En]: En[S] extends Record<string, string>
    ? `${S & string}.${keyof En[S] & string}`
    : never;
}[keyof En];

const resources = {
  en: { translation: en },
  es: { translation: es },
} as const;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function resolveBrowserLocale(
  languages: readonly string[] | string | null | undefined,
): Locale {
  const browserLanguages =
    typeof languages === "string" ? [languages] : Array.isArray(languages) ? languages : [];

  for (const language of browserLanguages) {
    const normalized = language.toLowerCase();

    if (normalized.startsWith("en")) return "en";
    if (normalized.startsWith("es")) return "es";
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
