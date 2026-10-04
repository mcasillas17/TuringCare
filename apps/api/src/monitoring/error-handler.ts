import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { routePath } from "hono/route";
import { invalidValidationResult, isMalformedJsonValidationError } from "../middleware/validation";
import type { ApiEnv } from "./request-id";
import { reportApiError } from "./sentry";

type Report = typeof reportApiError;

/**
 * Builds the app-wide Hono error boundary. `report` defaults to the real
 * log + Sentry adapter but is injectable so tests can assert on reported
 * errors without touching Sentry.
 *
 * Preserves the existing HTTP response contract:
 * - malformed JSON is collapsed to the same stable validation-code payload as
 *   schema failures, without exposing parser prose;
 * - every other 4xx `HTTPException` (auth, not-found, rate-limit, ...) is
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
 * Every captured (>=500) branch calls {@link reportApiError} exactly once,
 * which logs independent of whether Sentry capture is enabled.
 */
export function createMonitoringErrorHandler(report?: Report): ErrorHandler<ApiEnv>;
export function createMonitoringErrorHandler<E extends ApiEnv>(report?: Report): ErrorHandler<E>;
export function createMonitoringErrorHandler<E extends ApiEnv>(
  report: Report = reportApiError,
): ErrorHandler<E> {
  return (err, c) => {
    const route = routePath(c) || "unmatched";
    const method = c.req.method;
    const requestId = c.get("requestId") ?? "unknown";

    if (isMalformedJsonValidationError(err)) {
      return c.json(invalidValidationResult(), 400);
    }

    if (err instanceof HTTPException) {
      const res = err.getResponse();
      if (res.status >= 500) {
        report(err, { route, method, status: res.status, requestId });
      }
      return res;
    }

    report(err, { route, method, status: 500, requestId });
    return c.json({ error: "internal_server_error" } as const, 500);
  };
}
