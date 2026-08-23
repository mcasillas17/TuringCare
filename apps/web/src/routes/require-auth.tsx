import { useI18n } from "@/i18n";
import { useSession } from "@/lib/auth-client";
import { useSessionQueryReady } from "@/lib/session-query-boundary";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  const userId = data?.user?.id;
  const identityReady = useSessionQueryReady(typeof userId === "string" ? userId : null);
  const { t } = useI18n();
  if (isPending || !identityReady) return <p className="p-8">{t("common.loading")}</p>;
  if (!data) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
