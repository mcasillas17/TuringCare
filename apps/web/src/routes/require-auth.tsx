import { SessionError } from "@/components/session-error";
import { useI18n } from "@/i18n";
import { useLocaleAccountReadiness } from "@/i18n/locale-account-bridge";
import { useSession } from "@/lib/auth-client";
import { authPagePath } from "@/lib/auth-navigation";
import { useSessionQueryReady } from "@/lib/session-query-boundary";
import { isNonemptySessionUserId } from "@/lib/session-user-id";
import { useHasVerifiedSession } from "@/lib/verified-session";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending, error } = useSession();
  const verified = useHasVerifiedSession();
  const rawUserId = data?.user?.id;
  const userId = isNonemptySessionUserId(rawUserId) ? rawUserId : null;
  const identityReady = useSessionQueryReady(userId);
  const localeAccountReadiness = useLocaleAccountReadiness();
  const { t, locale } = useI18n();
  const { pathname } = useLocation();
  if (error) return <SessionError />;
  if (isPending && !userId) return <p className="p-8">{t("common.loading")}</p>;
  if (!data || !userId) return <Navigate to={authPagePath("/login", pathname, locale)} replace />;
  if (!verified) return <Navigate to={authPagePath("/verify-email", pathname, locale)} replace />;
  if (!identityReady || !localeAccountReadiness.ready)
    return <p className="p-8">{t("common.loading")}</p>;
  return <>{children}</>;
}
