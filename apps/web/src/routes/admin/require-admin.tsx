import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { authPagePath } from "@/lib/auth-navigation";
import { useMe } from "@/lib/me";
import { RequireAuth } from "@/routes/require-auth";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

export function RequireAdmin({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AuthenticatedAdmin>{children}</AuthenticatedAdmin>
    </RequireAuth>
  );
}

function AuthenticatedAdmin({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n();
  const { pathname } = useLocation();
  const { data, isPending, isError, isFetching, refetch } = useMe();
  if (isPending) return <p className="p-8">{t("common.loading")}</p>;
  if (isError)
    return (
      <div className="space-y-4 p-8" role="alert">
        <p>{t("verification.accessError")}</p>
        <Button disabled={isFetching} onClick={() => void refetch()}>
          {t("verification.retry")}
        </Button>
      </div>
    );
  if (data?.emailVerified !== true)
    return <Navigate to={authPagePath("/verify-email", pathname, locale)} replace />;
  if (data.role !== "admin") return <Navigate to="/my" replace />;
  return <>{children}</>;
}
