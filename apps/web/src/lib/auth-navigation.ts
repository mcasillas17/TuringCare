import type { Locale } from "@turingcare/i18n";
import { safeAuthReturnPath } from "@turingcare/shared";

export function authPagePath(
  page: "/login" | "/register" | "/verify-email",
  returnTo: unknown,
  locale: Locale,
) {
  const params = new URLSearchParams({ next: safeAuthReturnPath(returnTo), lang: locale });
  return `${page}?${params}`;
}

export function verificationCallbackUrl(returnTo: unknown, locale: Locale) {
  const params = new URLSearchParams({
    status: "verified",
    next: safeAuthReturnPath(returnTo),
    lang: locale,
  });
  return `${window.location.origin}/verify-email?${params}`;
}

export function isEmailUnverifiedCode(code: unknown) {
  return code === "EMAIL_NOT_VERIFIED" || code === "email_unverified";
}
