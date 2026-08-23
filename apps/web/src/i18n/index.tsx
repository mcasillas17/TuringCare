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
import { I18nextProvider, useTranslation } from "react-i18next";
import { setActiveLocale } from "./active-locale";

const STORAGE_KEY = "tc-locale";
const WEB_I18N = createI18n("en");

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
  return translateMessage({ t: WEB_I18N.getFixedT(locale) }, key, vars);
}

type I18n = {
  locale: Locale;
  selectLocale: (locale: unknown) => boolean;
  adoptLocale: (locale: unknown) => boolean;
  explicitSelectionRevision: number;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const Ctx = createContext<I18n | null>(null);

function activateLocale(locale: unknown): locale is Locale {
  if (!setActiveLocale(locale)) return false;
  void WEB_I18N.changeLanguage(locale);
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  return true;
}

function initializeLocale() {
  const locale = detectInitialLocale();
  activateLocale(locale);
  return { explicitSelectionRevision: 0, locale };
}

type LocaleContextProviderProps = Omit<I18n, "t"> & { children: ReactNode };

function LocaleContextProvider({
  adoptLocale,
  children,
  explicitSelectionRevision,
  locale,
  selectLocale,
}: LocaleContextProviderProps) {
  const { t: reactTranslate } = useTranslation();
  const t = useCallback<I18n["t"]>(
    (key, vars) => translateMessage({ t: reactTranslate }, key, vars),
    [reactTranslate],
  );
  const value = useMemo<I18n>(
    () => ({ adoptLocale, explicitSelectionRevision, locale, selectLocale, t }),
    [adoptLocale, explicitSelectionRevision, locale, selectLocale, t],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [localeState, setLocaleState] = useState(initializeLocale);
  const { explicitSelectionRevision, locale } = localeState;

  useEffect(() => {
    activateLocale(locale);
  }, [locale]);

  const updateLocale = useCallback((nextLocale: unknown, explicitSelection: boolean) => {
    if (!activateLocale(nextLocale)) return false;
    setLocaleState((current) => ({
      explicitSelectionRevision: explicitSelection
        ? current.explicitSelectionRevision + 1
        : current.explicitSelectionRevision,
      locale: nextLocale,
    }));

    try {
      localStorage.setItem(STORAGE_KEY, nextLocale);
    } catch {
      /* ignore */
    }
    return true;
  }, []);

  const selectLocale = useCallback(
    (nextLocale: unknown) => updateLocale(nextLocale, true),
    [updateLocale],
  );
  const adoptLocale = useCallback(
    (nextLocale: unknown) => updateLocale(nextLocale, false),
    [updateLocale],
  );

  return (
    <I18nextProvider i18n={WEB_I18N}>
      <LocaleContextProvider
        adoptLocale={adoptLocale}
        explicitSelectionRevision={explicitSelectionRevision}
        locale={locale}
        selectLocale={selectLocale}
      >
        {children}
      </LocaleContextProvider>
    </I18nextProvider>
  );
}

export function useI18n(): I18n {
  const ctx = useContext(Ctx);

  if (!ctx) {
    return {
      locale: "en",
      selectLocale: () => false,
      adoptLocale: () => false,
      explicitSelectionRevision: 0,
      t: (key, vars) => translate("en", key, vars),
    };
  }

  return ctx;
}
