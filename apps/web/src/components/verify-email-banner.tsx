import { useI18n } from "@/i18n";
import { useSession } from "@/lib/auth-client";
import { authPagePath } from "@/lib/auth-navigation";
import { isNonemptySessionUserId } from "@/lib/session-user-id";
import { useHasVerifiedSession } from "@/lib/verified-session";
import { Navigate, useLocation } from "react-router-dom";

/** Compatibility for existing shell callers: recovery is a wall, not a notice. */
export function VerifyEmailBanner() {
  const { locale } = useI18n();
  const { data, isPending, isRefetching, error } = useSession();
  const verified = useHasVerifiedSession();
  const { pathname } = useLocation();
  if (isPending || isRefetching || error || !isNonemptySessionUserId(data?.user.id) || verified)
    return null;
  return <Navigate to={authPagePath("/verify-email", pathname, locale)} replace />;
}
