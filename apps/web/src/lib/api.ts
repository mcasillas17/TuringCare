import type { AppType } from "@turingcare/api";
import { isLocale } from "@turingcare/i18n";
import { hc } from "hono/client";
import { getActiveLocale } from "../i18n/active-locale";

const LOCALE_HEADER = "X-TuringCare-Locale";
const STORAGE_KEY = "tc-locale";

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

export function localeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = mergeHeaders(input, init);
  const locale = getActiveLocale() ?? readStoredLocale();

  if (locale && !headers.has(LOCALE_HEADER)) {
    headers.set(LOCALE_HEADER, locale);
  }

  return fetch(input, { ...init, headers });
}

// Dev: VITE_API_URL is unset → "/" so the Vite proxy forwards /health, /me,
// /api/* to the local API. Prod: VITE_API_URL=https://api.turingcare.dog
// (inlined at build time) so the deployed frontend calls the API subdomain.
export const api = hc<AppType>(import.meta.env.VITE_API_URL || "/", {
  fetch: localeFetch,
  init: { credentials: "include" },
});
