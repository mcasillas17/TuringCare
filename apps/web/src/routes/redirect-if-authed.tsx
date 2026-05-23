import { useI18n } from "@/i18n";
import { useSession } from "@/lib/auth-client";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

/** Mirror of RequireAuth: keeps already-authenticated users out of the auth
 * pages (login/register) by sending them to the app. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  const { t } = useI18n();
  if (isPending) return <p className="p-8">{t("common.loading")}</p>;
  if (data) return <Navigate to="/my" replace />;
  return <>{children}</>;
}
