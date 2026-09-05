import { SessionError } from "@/components/session-error";
import { useI18n } from "@/i18n";
import { useSession } from "@/lib/auth-client";
import { authPagePath } from "@/lib/auth-navigation";
import { isNonemptySessionUserId } from "@/lib/session-user-id";
import { useHasVerifiedSession } from "@/lib/verified-session";
import { safeAuthReturnPath } from "@turingcare/shared";
import type { ReactNode } from "react";
import { Navigate, useSearchParams } from "react-router-dom";

/** Mirror of RequireAuth: keeps already-authenticated users out of the auth
 * pages (login/register) by sending them to the app. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { data, isPending, error } = useSession();
  const verified = useHasVerifiedSession();
  const { t, locale } = useI18n();
  const [params] = useSearchParams();
  const next = safeAuthReturnPath(params.get("next"));
  if (error) return <SessionError />;
  if (isPending && !isNonemptySessionUserId(data?.user.id))
    return <p className="p-8">{t("common.loading")}</p>;
  if (isNonemptySessionUserId(data?.user?.id))
    return <Navigate to={verified ? next : authPagePath("/verify-email", next, locale)} replace />;
  return <>{children}</>;
}
