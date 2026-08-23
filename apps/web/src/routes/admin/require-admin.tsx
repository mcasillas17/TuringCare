import { useI18n } from "@/i18n";
import { useMe } from "@/lib/me";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { data, isPending, isError } = useMe();
  if (isPending) return <p className="p-8">{t("common.loading")}</p>;
  if (isError || data?.role !== "admin") return <Navigate to="/my" replace />;
  return <>{children}</>;
}
