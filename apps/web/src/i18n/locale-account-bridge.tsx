import { useMe } from "@/lib/me";
import { useProfile, useUpdateProfileLocale } from "@/lib/profile";
import type { Locale } from "@turingcare/i18n";
import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useI18n } from ".";

export function LocaleAccountBridge() {
  const { locale, setLocale, t } = useI18n();
  const { data: me } = useMe();
  const { data: profile } = useProfile(me?.id ?? null);
  const { mutateAsync } = useUpdateProfileLocale(me?.id ?? null);
  const profileIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const adoptingLocaleRef = useRef<Locale | null>(null);
  const observedLocaleRef = useRef<Locale | null>(null);
  const latestDesiredLocaleRef = useRef<Locale | null>(null);

  const persistLocale = useCallback(
    (nextLocale: Locale) => {
      latestDesiredLocaleRef.current = nextLocale;
      void mutateAsync({ locale: nextLocale })
        .then((updated) => {
          const latestDesiredLocale = latestDesiredLocaleRef.current;

          if (latestDesiredLocale && updated.locale !== latestDesiredLocale) {
            persistLocale(latestDesiredLocale);
          }
        })
        .catch(() => {
          if (latestDesiredLocaleRef.current === nextLocale) {
            toast.error(t("profile.localeSaveFailed"));
          }
        });
    },
    [mutateAsync, t],
  );

  useEffect(() => {
    if (!profile) return;

    if (profileIdRef.current !== profile.id) {
      profileIdRef.current = profile.id;
      initializedRef.current = false;
      adoptingLocaleRef.current = null;
      observedLocaleRef.current = null;
      latestDesiredLocaleRef.current = null;
    }

    if (initializedRef.current) return;

    initializedRef.current = true;

    if (profile.locale && profile.locale !== locale) {
      adoptingLocaleRef.current = profile.locale;
      setLocale(profile.locale);
      return;
    }

    observedLocaleRef.current = locale;

    if (!profile.locale) persistLocale(locale);
  }, [locale, persistLocale, profile, setLocale]);

  useEffect(() => {
    if (!profile || !initializedRef.current) return;

    if (adoptingLocaleRef.current && adoptingLocaleRef.current !== locale) return;

    if (adoptingLocaleRef.current === locale) {
      adoptingLocaleRef.current = null;
      observedLocaleRef.current = locale;
      return;
    }

    if (latestDesiredLocaleRef.current && latestDesiredLocaleRef.current !== locale) {
      observedLocaleRef.current = locale;
      persistLocale(locale);
      return;
    }

    if (profile.locale === locale || observedLocaleRef.current === locale) {
      observedLocaleRef.current = locale;
      return;
    }

    observedLocaleRef.current = locale;
    persistLocale(locale);
  }, [locale, persistLocale, profile]);

  return null;
}
