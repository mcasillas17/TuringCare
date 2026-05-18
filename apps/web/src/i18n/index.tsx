import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { en } from "./en";
import { es } from "./es";
import type { Locale, MessageKey, Messages } from "./types";

const CATALOGS: Record<Locale, Messages> = { en, es };
const STORAGE_KEY = "tc-locale";

function isLocale(v: unknown): v is Locale {
  return v === "en" || v === "es";
}

export function detectInitialLocale(): Locale {
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (isLocale(stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const langs = nav?.languages?.length ? nav.languages : [nav?.language ?? ""];
  return langs.some((l) => l?.toLowerCase().startsWith("es")) ? "es" : "en";
}

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const [section, leaf] = key.split(".") as [string, string];
  const cat = CATALOGS[locale] ?? en;
  const raw =
    (cat as Record<string, Record<string, string>>)[section]?.[leaf] ??
    (en as unknown as Record<string, Record<string, string>>)[section]?.[leaf];
  if (typeof raw !== "string") return key;
  return vars ? raw.replace(/\{(\w+)\}/g, (_m, v) => String(vars[v] ?? `{${v}}`)) : raw;
}

type I18n = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const Ctx = createContext<I18n | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") document.documentElement.lang = l;
  }, []);

  const value = useMemo<I18n>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      locale: "en",
      setLocale: () => {},
      t: (key, vars) => translate("en", key, vars),
    };
  }
  return ctx;
}
