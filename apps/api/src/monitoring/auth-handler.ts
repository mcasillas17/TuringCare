// Adapter that wraps Better Auth's raw request handler so an unexpected
// (>=500) response it returns is observed the same way a thrown application
// error is (see error-handler.ts). Better Auth's handler returns a full
// `Response` rather than throwing — even for its own internal failures — so
// it never reaches the Hono error boundary and would otherwise be a blind
// spot (see docs/superpowers/specs/2026-08-10-production-operational-readiness-design.md,
// "Web capture boundary": "Authentication traffic ... is routed through the
// same monitored transport so auth 5xx failures are not blind spots").
//
// This module never reads or clones the response body: only `res.status` is
// inspected, and the exact `Response` instance Better Auth returned is
// always what's returned here, so headers, cookies, and the body stream are
// preserved unchanged for every status, including >=500.

import type { Context } from "hono";
import { logApiError } from "./log-error";
import type { ApiEnv } from "./request-id";
import { captureApiError } from "./sentry";

/** Shape of Better Auth's `auth.handler`, kept minimal so tests can inject a fake. */
export type AuthRequestHandler = (request: Request) => Promise<Response>;

type Capture = typeof captureApiError;

/** Normalized route tag for every Better Auth request, matching the mounted path in app.ts. */
const AUTH_ROUTE = "/api/auth/*";

/**
 * Builds a Hono handler that delegates to Better Auth's `handler` and
 * observes unexpected server errors it returns. `handler` must be supplied
 * by the caller (see app.ts, which wires the real Better Auth handler);
 * `capture` defaults to the real Sentry adapter but is injectable so tests
 * can assert on captured errors without a real Better Auth instance or
 * Sentry.
 *
 * - Any response is returned to the caller completely unchanged.
 * - A response with `status >= 500` is captured/logged exactly once, using a
 *   new, fixed-message `Error` — never the response body or Better Auth's
 *   own message — tagged with route `/api/auth/*`, the request method, the
 *   response status, and the current request ID.
 * - Expected 4xx responses (bad credentials, rate limiting, ...) are never
 *   captured or logged.
 * - The structured `console.error` from {@link logApiError} is emitted
 *   independent of whether Sentry capture is enabled, so an unexpected auth
 *   failure is never silent just because monitoring is disabled.
 */
export function createMonitoringAuthHandler(
  handler: AuthRequestHandler,
  capture: Capture = captureApiError,
) {
  return async (c: Context<ApiEnv>): Promise<Response> => {
    const res = await handler(c.req.raw);

    if (res.status >= 500) {
      const meta = {
        route: AUTH_ROUTE,
        method: c.req.method,
        status: res.status,
        requestId: c.get("requestId") ?? "unknown",
      };
      const error = new Error("Better Auth handler returned an unexpected server error");
      logApiError(error, meta);
      capture(error, meta);
    }

    return res;
  };
}
