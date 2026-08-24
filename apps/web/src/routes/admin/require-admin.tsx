import { useI18n } from "@/i18n";
import { useLocaleAccountReadiness } from "@/i18n/locale-account-bridge";
import { useMe } from "@/lib/me";
import { useSessionQueriesReady } from "@/lib/session-query-boundary";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const identityReady = useSessionQueriesReady();
  const localeAccountReadiness = useLocaleAccountReadiness();

  if (!identityReady || !localeAccountReadiness.ready)
    return <p className="p-8">{t("common.loading")}</p>;

  return <AuthenticatedAdmin>{children}</AuthenticatedAdmin>;
}

function AuthenticatedAdmin({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { data, isPending, isError } = useMe();
  if (isPending) return <p className="p-8">{t("common.loading")}</p>;
  if (isError || data?.role !== "admin") return <Navigate to="/my" replace />;
  return <>{children}</>;
}
