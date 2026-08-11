import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { routePath } from "hono/route";
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
 */
export function createMonitoringErrorHandler(
  capture: Capture = captureApiError,
): ErrorHandler<ApiEnv> {
  return (err, c) => {
    const route = routePath(c);
    const method = c.req.method;
    const requestId = c.get("requestId");

    if (err instanceof HTTPException) {
      const res = err.getResponse();
      if (res.status >= 500) {
        capture(err, { route, method, status: res.status, requestId });
      }
      return res;
    }

    capture(err, { route, method, status: 500, requestId });
    return c.json({ error: "internal_server_error" } as const, 500);
  };
}
