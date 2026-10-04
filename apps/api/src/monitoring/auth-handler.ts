// Adapter that wraps Better Auth's raw request handler so an unexpected
// (>=500) response it returns is observed the same way a thrown application
// error is (see error-handler.ts). Better Auth's handler returns a full
// `Response` rather than throwing — even for its own internal failures — so
// it never reaches the Hono error boundary and would otherwise be a blind
// spot: auth traffic goes through the same monitored transport so auth 5xx
// failures are captured too.
//
// This module never reads or clones the response body: only `res.status` is
// inspected, and the exact `Response` instance Better Auth returned is
// always what's returned here, so headers, cookies, and the body stream are
// preserved unchanged for every status, including >=500.

import type { Context } from "hono";
import type { ApiEnv } from "./request-id";
import { reportApiError } from "./sentry";

/** Shape of Better Auth's `auth.handler`, kept minimal so tests can inject a fake. */
export type AuthRequestHandler = (request: Request) => Promise<Response>;

type Report = typeof reportApiError;

/** Normalized route tag for every Better Auth request, matching the mounted path in app.ts. */
const AUTH_ROUTE = "/api/auth/*";

/**
 * Builds a Hono handler that delegates to Better Auth's `handler` and
 * observes unexpected server errors it returns. `handler` must be supplied
 * by the caller (see app.ts, which wires the real Better Auth handler);
 * `report` defaults to the real log + Sentry adapter but is injectable so
 * tests can assert on reported errors without a real Better Auth instance or
 * Sentry.
 *
 * - Any response is returned to the caller completely unchanged.
 * - A response with `status >= 500` is reported exactly once, using a
 *   new, fixed-message `Error` — never the response body or Better Auth's
 *   own message — tagged with route `/api/auth/*`, the request method, the
 *   response status, and the current request ID.
 * - Expected 4xx responses (bad credentials, rate limiting, ...) are never
 *   captured or logged.
 * - {@link reportApiError} logs independent of whether Sentry capture is
 *   enabled, so an unexpected auth failure is never silent.
 */
export function createMonitoringAuthHandler(
  handler: AuthRequestHandler,
  report: Report = reportApiError,
) {
  return async (c: Context<ApiEnv>): Promise<Response> => {
    const res = await handler(c.req.raw);

    if (res.status >= 500) {
      report(new Error("Better Auth handler returned an unexpected server error"), {
        route: AUTH_ROUTE,
        method: c.req.method,
        status: res.status,
        requestId: c.get("requestId") ?? "unknown",
      });
    }

    return res;
  };
}
