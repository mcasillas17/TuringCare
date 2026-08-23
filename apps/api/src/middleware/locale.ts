import { type Locale, isLocale } from "@turingcare/i18n";
import { createMiddleware } from "hono/factory";

export type LocaleEnv = { Variables: { locale: Locale } };

const LOCALE_HEADER = "X-TuringCare-Locale";
const MAX_LOCALE_HEADER_LENGTH = 16;
const MAX_ACCEPT_LANGUAGE_LENGTH = 256;
const MAX_ACCEPT_LANGUAGE_VALUES = 8;
const LANGUAGE_TAG_PATTERN = /^(?<primary>[a-z]{1,8})(?:-[a-z0-9]{1,8})*$/i;
const QUALITY_VALUE_PATTERN = /^(?:0(?:\.\d{1,3})?|1(?:\.0{1,3})?)$/;

function parseLocaleHeader(value: string | undefined): Locale | null {
  if (!value || value.length > MAX_LOCALE_HEADER_LENGTH) return null;

  const normalized = value.trim().toLowerCase();
  return isLocale(normalized) ? normalized : null;
}

function parseLanguageTag(value: string): Locale | null {
  const normalized = value.trim().toLowerCase();
  const match = LANGUAGE_TAG_PATTERN.exec(normalized);

  if (!match?.groups?.primary) return null;

  return isLocale(match.groups.primary) ? match.groups.primary : null;
}

function parseQualityValue(value: string): number | null {
  if (!QUALITY_VALUE_PATTERN.test(value)) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseWeightedLocale(
  value: string,
  index: number,
): { locale: Locale; quality: number; index: number } | null {
  const [rawTag, ...rawParams] = value.split(";");
  const locale = parseLanguageTag(rawTag ?? "");

  if (!locale) return null;

  let quality = 1;
  let sawQuality = false;

  for (const rawParam of rawParams) {
    const param = rawParam.trim();

    if (!param) return null;

    const parts = param.split("=");
    if (parts.length !== 2) return null;

    const [name, rawValue] = parts;
    if (name?.trim().toLowerCase() !== "q" || sawQuality) return null;

    const parsedQuality = parseQualityValue(rawValue?.trim() ?? "");
    if (parsedQuality === null || parsedQuality === 0) return null;

    quality = parsedQuality;
    sawQuality = true;
  }

  return { locale, quality, index };
}

function parseAcceptLanguage(value: string | undefined): Locale {
  if (!value || value.length > MAX_ACCEPT_LANGUAGE_LENGTH) return "en";

  const candidates = value.split(",").slice(0, MAX_ACCEPT_LANGUAGE_VALUES);
  let bestMatch: { locale: Locale; quality: number; index: number } | null = null;

  for (const [index, candidate] of candidates.entries()) {
    const parsed = parseWeightedLocale(candidate, index);

    if (!parsed) continue;

    if (!bestMatch || parsed.quality > bestMatch.quality) {
      bestMatch = parsed;
    }
  }

  return bestMatch?.locale ?? "en";
}

export function resolveRequestLocale(request: Pick<Request, "headers">): Locale {
  return (
    parseLocaleHeader(request.headers.get(LOCALE_HEADER) ?? undefined) ??
    parseAcceptLanguage(request.headers.get("Accept-Language") ?? undefined)
  );
}

export const localeMiddleware = createMiddleware<LocaleEnv>(async (c, next) => {
  const locale = resolveRequestLocale(c.req.raw);

  c.set("locale", locale);

  try {
    await next();
  } finally {
    c.header("Content-Language", locale);
  }
});
