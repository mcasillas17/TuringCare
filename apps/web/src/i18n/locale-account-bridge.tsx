import { useSession } from "@/lib/auth-client";
import { useProfile, useUpdateProfileLocale } from "@/lib/profile";
import { useSessionQueryReady } from "@/lib/session-query-boundary";
import { isNonemptySessionUserId } from "@/lib/session-user-id";
import type { Locale } from "@turingcare/i18n";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useI18n } from ".";

export type LocaleAccountReadinessStatus = "pending" | "signed-out" | "account" | "local-fallback";

type LocaleAccountReadiness = {
  ready: boolean;
  status: LocaleAccountReadinessStatus;
};

const SIGNED_OUT_READINESS: LocaleAccountReadiness = { ready: true, status: "signed-out" };
const PENDING_READINESS: LocaleAccountReadiness = { ready: false, status: "pending" };
const LocaleAccountReadinessContext = createContext<LocaleAccountReadiness>(SIGNED_OUT_READINESS);

type AuthenticatedLocaleAccountBridgeProps = {
  onReady?: (status: Extract<LocaleAccountReadinessStatus, "account" | "local-fallback">) => void;
  userId: string;
};

function AuthenticatedLocaleAccountBridge({
  onReady,
  userId,
}: AuthenticatedLocaleAccountBridgeProps) {
  const { adoptLocale, explicitSelectionRevision, locale, t } = useI18n();
  const { data: profile, isError: isProfileError } = useProfile(userId);
  const { mutateAsync } = useUpdateProfileLocale();
  const activeRef = useRef(true);
  const initialExplicitSelectionRevisionRef = useRef(explicitSelectionRevision);
  const initializedRef = useRef(false);
  const adoptingLocaleRef = useRef<Locale | null>(null);
  const observedLocaleRef = useRef<Locale | null>(null);
  const latestDesiredLocaleRef = useRef<Locale | null>(null);
  const readinessPendingRef = useRef(Boolean(onReady));

  const finishReadiness = useCallback(
    (status: Extract<LocaleAccountReadinessStatus, "account" | "local-fallback">) => {
      if (!readinessPendingRef.current) return;
      readinessPendingRef.current = false;
      onReady?.(status);
    },
    [onReady],
  );

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
            return;
          }

          finishReadiness("account");
        })
        .catch(() => {
          if (!activeRef.current) return;
          if (latestDesiredLocaleRef.current === nextLocale) {
            toast.error(t("profile.localeSaveFailed"));
            finishReadiness("local-fallback");
          }
        });
    },
    [finishReadiness, mutateAsync, t],
  );

  useEffect(() => {
    if (!isProfileError) return;
    observedLocaleRef.current = locale;
    finishReadiness("local-fallback");
  }, [finishReadiness, isProfileError, locale]);

  useEffect(() => {
    if (!profile) return;
    if (initializedRef.current) return;

    initializedRef.current = true;

    if (explicitSelectionRevision !== initialExplicitSelectionRevisionRef.current) {
      observedLocaleRef.current = locale;
      if (profile.locale !== locale) persistLocale(locale);
      else finishReadiness("account");
      return;
    }

    if (profile.locale && profile.locale !== locale) {
      adoptingLocaleRef.current = profile.locale;
      adoptLocale(profile.locale);
      return;
    }

    observedLocaleRef.current = locale;

    if (!profile.locale) persistLocale(locale);
    else finishReadiness("account");
  }, [adoptLocale, explicitSelectionRevision, finishReadiness, locale, persistLocale, profile]);

  useEffect(() => {
    if (!profile || !initializedRef.current) return;

    if (adoptingLocaleRef.current && adoptingLocaleRef.current !== locale) return;

    if (adoptingLocaleRef.current === locale) {
      adoptingLocaleRef.current = null;
      observedLocaleRef.current = locale;
      finishReadiness("account");
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
  }, [finishReadiness, locale, persistLocale, profile]);

  return null;
}

export function LocaleAccountBridge() {
  const { data: session, isPending } = useSession();
  const rawUserId = session?.user?.id;
  const userId = isNonemptySessionUserId(rawUserId) ? rawUserId : null;
  const identityReady = useSessionQueryReady(userId);

  if (isPending || !identityReady || !userId) return null;

  return <AuthenticatedLocaleAccountBridge key={userId} userId={userId} />;
}

function AuthenticatedLocaleAccountBoundary({
  children,
  userId,
}: { children: ReactNode; userId: string }) {
  const { t } = useI18n();
  const [readinessStatus, setReadinessStatus] = useState<LocaleAccountReadinessStatus>("pending");
  const readiness = useMemo<LocaleAccountReadiness>(
    () => ({ ready: readinessStatus !== "pending", status: readinessStatus }),
    [readinessStatus],
  );

  return (
    <LocaleAccountReadinessContext.Provider value={readiness}>
      <AuthenticatedLocaleAccountBridge
        userId={userId}
        onReady={(status) => setReadinessStatus(status)}
      />
      {readiness.ready ? children : <p className="p-8">{t("common.loading")}</p>}
    </LocaleAccountReadinessContext.Provider>
  );
}

export function LocaleAccountBoundary({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const { t } = useI18n();
  const rawUserId = session?.user?.id;
  const userId = isNonemptySessionUserId(rawUserId) ? rawUserId : null;
  const identityReady = useSessionQueryReady(userId);

  if (isPending) {
    return (
      <LocaleAccountReadinessContext.Provider value={PENDING_READINESS}>
        <p className="p-8">{t("common.loading")}</p>
      </LocaleAccountReadinessContext.Provider>
    );
  }

  if (!userId) {
    return (
      <LocaleAccountReadinessContext.Provider value={SIGNED_OUT_READINESS}>
        {children}
      </LocaleAccountReadinessContext.Provider>
    );
  }

  if (!identityReady) {
    return (
      <LocaleAccountReadinessContext.Provider value={PENDING_READINESS}>
        <p className="p-8">{t("common.loading")}</p>
      </LocaleAccountReadinessContext.Provider>
    );
  }

  return (
    <AuthenticatedLocaleAccountBoundary key={userId} userId={userId}>
      {children}
    </AuthenticatedLocaleAccountBoundary>
  );
}

export function useLocaleAccountReadiness(): LocaleAccountReadiness {
  return useContext(LocaleAccountReadinessContext);
}
