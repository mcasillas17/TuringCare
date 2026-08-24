import type { Locale } from "@turingcare/i18n";

export function suggestionKey(dogId: string, weekKey: string, locale?: Locale) {
  const root = ["suggestion", dogId, weekKey] as const;
  return locale === undefined ? root : ([...root, locale] as const);
}
