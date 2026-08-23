import { isLocale, resolveBrowserLocale, type Locale } from "@turingcare/i18n";
import { createMiddleware } from "hono/factory";

export type LocaleEnv = { Variables: { locale: Locale } };

const LOCALE_HEADER = "X-TuringCare-Locale";
const MAX_LOCALE_HEADER_LENGTH = 16;
const MAX_ACCEPT_LANGUAGE_LENGTH = 256;
const MAX_ACCEPT_LANGUAGE_VALUES = 8;

function parseLocaleHeader(value: string | undefined): Locale | null {
  if (!value || value.length > MAX_LOCALE_HEADER_LENGTH) return null;

  const normalized = value.trim().toLowerCase();
  return isLocale(normalized) ? normalized : null;
}

function parseAcceptLanguage(value: string | undefined): Locale {
  if (!value || value.length > MAX_ACCEPT_LANGUAGE_LENGTH) return "en";

  const languages = value
    .split(",")
    .slice(0, MAX_ACCEPT_LANGUAGE_VALUES)
    .map((part) => part.split(";")[0]?.trim())
    .filter((part): part is string => Boolean(part));

  return resolveBrowserLocale(languages);
}

export const localeMiddleware = createMiddleware<LocaleEnv>(async (c, next) => {
  const locale =
    parseLocaleHeader(c.req.header(LOCALE_HEADER)) ?? parseAcceptLanguage(c.req.header("Accept-Language"));

  c.set("locale", locale);

  try {
    await next();
  } finally {
    c.header("Content-Language", locale);
  }
});
