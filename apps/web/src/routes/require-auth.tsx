import { useI18n } from "@/i18n";
import { useLocaleAccountReadiness } from "@/i18n/locale-account-bridge";
import { useSession } from "@/lib/auth-client";
import { useSessionQueryReady } from "@/lib/session-query-boundary";
import { isNonemptySessionUserId } from "@/lib/session-user-id";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  const rawUserId = data?.user?.id;
  const userId = isNonemptySessionUserId(rawUserId) ? rawUserId : null;
  const identityReady = useSessionQueryReady(userId);
  const localeAccountReadiness = useLocaleAccountReadiness();
  const { t } = useI18n();
  if (isPending) return <p className="p-8">{t("common.loading")}</p>;
  if (!data || !userId) return <Navigate to="/login" replace />;
  if (!identityReady || !localeAccountReadiness.ready)
    return <p className="p-8">{t("common.loading")}</p>;
  return <>{children}</>;
}
