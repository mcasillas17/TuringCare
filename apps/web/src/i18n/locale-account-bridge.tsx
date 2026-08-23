import { useProfile, useUpdateProfileLocale } from "@/lib/profile";
import type { Locale } from "@turingcare/i18n";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useI18n } from ".";

export function LocaleAccountBridge() {
  const { locale, setLocale, t } = useI18n();
  const { data: profile } = useProfile();
  const { mutate } = useUpdateProfileLocale();
  const initializedRef = useRef(false);
  const adoptingLocaleRef = useRef<Locale | null>(null);
  const observedLocaleRef = useRef<Locale | null>(null);

  useEffect(() => {
    if (!profile || initializedRef.current) return;

    initializedRef.current = true;

    if (profile.locale && profile.locale !== locale) {
      adoptingLocaleRef.current = profile.locale;
      setLocale(profile.locale);
      return;
    }

    observedLocaleRef.current = locale;
  }, [locale, profile, setLocale]);

  useEffect(() => {
    if (!profile || !initializedRef.current) return;

    if (adoptingLocaleRef.current && adoptingLocaleRef.current !== locale) return;

    if (adoptingLocaleRef.current === locale) {
      adoptingLocaleRef.current = null;
      observedLocaleRef.current = locale;
      return;
    }

    if (profile.locale === locale || observedLocaleRef.current === locale) {
      observedLocaleRef.current = locale;
      return;
    }

    observedLocaleRef.current = locale;
    mutate(
      { locale },
      {
        onError: () => {
          toast.error(t("profile.localeSaveFailed"));
        },
      },
    );
  }, [locale, mutate, profile, t]);

  return null;
}
