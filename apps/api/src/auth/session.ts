import { auth } from "../auth";

/** Authorization never uses an embedded cookie cache, including legacy cookies. */
export function getAuthoritativeSession(headers: Headers) {
  return auth.api.getSession({ headers, query: { disableCookieCache: true } });
}
