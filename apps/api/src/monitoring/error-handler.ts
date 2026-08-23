import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { routePath } from "hono/route";
import { logApiError } from "./log-error";
import type { ApiEnv } from "./request-id";
import { captureApiError } from "./sentry";

type Capture = typeof captureApiError;

/**
 * Builds the app-wide Hono error boundary. `capture` defaults to the real
 * Sentry adapter but is injectable so tests can assert on captured errors
 * without touching Sentry.
 *
 * Preserves the existing HTTP response contract:
 * - a 4xx `HTTPException` (validation, auth, not-found, rate-limit, ...) is
 *   returned completely unchanged and is never captured;
 * - a 5xx `HTTPException` is returned completely unchanged, but IS captured;
 * - any other thrown value is an unexpected failure: it is captured once and
 *   collapsed to a generic `internal_server_error` 500 body, so no raw error
 *   message or stack trace ever reaches a client.
 *
 * The request ID set by `requestIdMiddleware` is already on `c.res` headers
 * (set after `next()` in that middleware runs), so every response — including
 * this handler's — carries it.
 *
 * Every captured (>=500) branch also emits exactly one privacy-safe
 * structured `console.error` via {@link logApiError}, independent of whether
 * Sentry capture is enabled — so an unexpected failure is never silent just
 * because monitoring is disabled, misconfigured, or Node-guarded off (see
 * sentry.ts). Each branch runs at most once per request, so a given failure
 * is never logged twice.
 */
export function createMonitoringErrorHandler(
  capture?: Capture,
): ErrorHandler<ApiEnv>;
export function createMonitoringErrorHandler<E extends ApiEnv>(
  capture?: Capture,
): ErrorHandler<E>;
export function createMonitoringErrorHandler<E extends ApiEnv>(
  capture: Capture = captureApiError,
): ErrorHandler<E> {
  return (err, c) => {
    const route = routePath(c) || "unmatched";
    const method = c.req.method;
    const requestId = c.get("requestId") ?? "unknown";

    if (err instanceof HTTPException) {
      const res = err.getResponse();
      if (res.status >= 500) {
        const meta = { route, method, status: res.status, requestId };
        logApiError(err, meta);
        capture(err, meta);
      }
      return res;
    }

    const meta = { route, method, status: 500, requestId };
    logApiError(err, meta);
    capture(err, meta);
    return c.json({ error: "internal_server_error" } as const, 500);
  };
}
