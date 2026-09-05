import type { AppType } from "@turingcare/api";
import { isLocale } from "@turingcare/i18n";
import { hc } from "hono/client";
import { getActiveLocale } from "../i18n/active-locale";
import { EMAIL_UNVERIFIED_EVENT, VERIFIED_SESSION_EVENT } from "./auth-access-events";

const LOCALE_HEADER = "X-TuringCare-Locale";
const STORAGE_KEY = "tc-locale";
let verificationDenialRevision = 0;

function readStoredLocale() {
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

function mergeHeaders(input: RequestInfo | URL, init: RequestInit | undefined) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);

  new Headers(init?.headers).forEach((value, key) => {
    headers.set(key, value);
  });

  return headers;
}

export async function localeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = mergeHeaders(input, init);
  const locale = getActiveLocale() ?? readStoredLocale();

  if (locale && !headers.has(LOCALE_HEADER)) {
    headers.set(LOCALE_HEADER, locale);
  }

  const requestRevision = verificationDenialRevision;
  const response = await fetch(input, { ...init, headers });
  const path = new URL(input instanceof Request ? input.url : String(input), window.location.origin)
    .pathname;
  const sessionResponse = path === "/api/auth/get-session";
  if (response.status === 403 || (response.ok && (sessionResponse || path === "/me"))) {
    try {
      const body = await response.clone().json();
      const unverified = response.status === 403 && body?.error === "email_unverified";
      const unverifiedMe = path === "/me" && response.ok && body?.user?.emailVerified !== true;
      if (unverified || unverifiedMe) {
        verificationDenialRevision += 1;
        window.dispatchEvent(new Event(EMAIL_UNVERIFIED_EVENT));
      } else if (
        sessionResponse &&
        body?.user?.emailVerified === true &&
        requestRevision === verificationDenialRevision
      ) {
        window.dispatchEvent(new Event(VERIFIED_SESSION_EVENT));
      }
    } catch {
      // Malformed responses remain failures for the calling query. Never turn a
      // decoding error into a verified session or expose upstream response copy.
    }
  }
  return response;
}

// Dev: VITE_API_URL is unset → "/" so the Vite proxy forwards /health, /me,
// /api/* to the local API. Prod: VITE_API_URL=https://api.turingcare.dog
// (inlined at build time) so the deployed frontend calls the API subdomain.
export const api = hc<AppType>(import.meta.env.VITE_API_URL || "/", {
  fetch: localeFetch,
  init: { credentials: "include" },
});
