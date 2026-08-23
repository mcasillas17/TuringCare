import { useSession } from "@/lib/auth-client";
import { useProfile, useUpdateProfileLocale } from "@/lib/profile";
import { useSessionQueryReady } from "@/lib/session-query-boundary";
import type { Locale } from "@turingcare/i18n";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { toast } from "sonner";
import { useI18n } from ".";

function AuthenticatedLocaleAccountBridge({ userId }: { userId: string }) {
  const { adoptLocale, explicitSelectionRevision, locale, t } = useI18n();
  const { data: profile } = useProfile(userId);
  const { mutateAsync } = useUpdateProfileLocale();
  const activeRef = useRef(true);
  const initialExplicitSelectionRevisionRef = useRef(explicitSelectionRevision);
  const initializedRef = useRef(false);
  const adoptingLocaleRef = useRef<Locale | null>(null);
  const observedLocaleRef = useRef<Locale | null>(null);
  const latestDesiredLocaleRef = useRef<Locale | null>(null);

  useLayoutEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      latestDesiredLocaleRef.current = null;
    };
  }, []);

  const persistLocale = useCallback(
    (nextLocale: Locale) => {
      latestDesiredLocaleRef.current = nextLocale;
      void mutateAsync({ locale: nextLocale })
        .then((updated) => {
          if (!activeRef.current) return;
          const latestDesiredLocale = latestDesiredLocaleRef.current;

          if (latestDesiredLocale && updated.locale !== latestDesiredLocale) {
            persistLocale(latestDesiredLocale);
          }
        })
        .catch(() => {
          if (!activeRef.current) return;
          if (latestDesiredLocaleRef.current === nextLocale) {
            toast.error(t("profile.localeSaveFailed"));
          }
        });
    },
    [mutateAsync, t],
  );

  useEffect(() => {
    if (!profile) return;
    if (initializedRef.current) return;

    initializedRef.current = true;

    if (explicitSelectionRevision !== initialExplicitSelectionRevisionRef.current) {
      observedLocaleRef.current = locale;
      if (profile.locale !== locale) persistLocale(locale);
      return;
    }

    if (profile.locale && profile.locale !== locale) {
      adoptingLocaleRef.current = profile.locale;
      adoptLocale(profile.locale);
      return;
    }

    observedLocaleRef.current = locale;

    if (!profile.locale) persistLocale(locale);
  }, [adoptLocale, explicitSelectionRevision, locale, persistLocale, profile]);

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

export function LocaleAccountBridge() {
  const { data: session, isPending } = useSession();
  const userId = session?.user?.id;
  const identityReady = useSessionQueryReady(typeof userId === "string" ? userId : null);

  if (isPending || !identityReady || typeof userId !== "string" || userId.length === 0) return null;

  return <AuthenticatedLocaleAccountBridge key={userId} userId={userId} />;
}
