import {
  type Locale,
  type MessageKey,
  createI18n,
  isLocale,
  resolveBrowserLocale,
  translate as translateMessage,
} from "@turingcare/i18n";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { setActiveLocale } from "./active-locale";

const STORAGE_KEY = "tc-locale";
const INSTANCES = {
  en: createI18n("en"),
  es: createI18n("es"),
} as const;

function getI18n(locale: Locale) {
  return INSTANCES[locale];
}

export function detectInitialLocale(): Locale {
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (isLocale(stored)) return stored;
  } catch {
    /* storage unavailable */
  }

  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const languages = nav?.languages?.length ? nav.languages : [nav?.language ?? ""];

  return resolveBrowserLocale(languages);
}

export function translate(
  locale: Locale,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  return translateMessage(getI18n(locale), key, vars);
}

type I18n = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const Ctx = createContext<I18n | null>(null);

function activateLocale(locale: Locale) {
  setActiveLocale(locale);
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

function initializeLocale() {
  const locale = detectInitialLocale();
  activateLocale(locale);
  return locale;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initializeLocale);

  useEffect(() => {
    activateLocale(locale);
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    activateLocale(nextLocale);
    setLocaleState(nextLocale);

    try {
      localStorage.setItem(STORAGE_KEY, nextLocale);
    } catch {
      /* ignore */
    }
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
