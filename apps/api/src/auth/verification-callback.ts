import type { Locale } from "@turingcare/i18n";
import { safeAuthReturnPath } from "@turingcare/shared";
import { env } from "../env";

/** Only frontend-origin callbacks may contribute a continuation destination. */
export function verificationCallback(input: unknown, locale: Locale): string {
  const target = new URL("/verify-email", env.FRONTEND_URL);
  let next = "/my";
  if (typeof input === "string" && input.length <= 4096 && !/[\\\s]/.test(input)) {
    try {
      const source = new URL(input, env.FRONTEND_URL);
      // URL parsing normalizes dot segments (including encoded ones). Reject
      // rather than converting those attacker-controlled paths into safe ones.
      const rawPath = input.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
      if (
        source.origin === target.origin &&
        rawPath === source.pathname &&
        !source.username &&
        !source.password &&
        !source.hash
      ) {
        next =
          source.pathname === "/verify-email"
            ? safeAuthReturnPath(source.searchParams.get("next"))
            : safeAuthReturnPath(input.startsWith("/") ? input : source.pathname + source.search);
      }
    } catch {
      // Invalid or untrusted callback inputs never become redirect targets.
    }
  }
  target.search = new URLSearchParams({ status: "verified", next, lang: locale }).toString();
  return target.toString();
}

export function verificationLink(url: string, locale: Locale): string {
  const target = new URL(url);
  const callback = target.searchParams.get("callbackURL");
  target.searchParams.set(
    "callbackURL",
    verificationCallback(callback === "/" ? undefined : callback, locale),
  );
  return target.toString();
}

/** The email's validated locale survives a fresh browser opening its link. */
export function verificationCallbackLocale(input: unknown, fallback: Locale): Locale {
  if (typeof input !== "string") return fallback;
  try {
    const source = new URL(input, env.FRONTEND_URL);
    if (source.origin !== new URL(env.FRONTEND_URL).origin) return fallback;
    const lang = source.searchParams.get("lang");
    return lang === "en" || lang === "es" ? lang : fallback;
  } catch {
    return fallback;
  }
}
