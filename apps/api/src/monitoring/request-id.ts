import { randomUUID } from "node:crypto";
import { createMiddleware } from "hono/factory";

/**
 * Hono `Env` shared by the whole API: every route and downstream middleware
 * can read the per-request correlation ID set by {@link requestIdMiddleware}.
 */
export type ApiEnv = { Variables: { requestId: string } };

/**
 * Accepted inbound `X-Request-ID` shape: an opaque, ASCII token 8-64
 * characters long. Anything else (too short, too long, or containing
 * characters outside this set, e.g. an email address) is never trusted
 * verbatim — it is replaced with a generated ID instead.
 */
const VALID_REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Correlates a request across logs, Sentry, and the client. Preserves a
 * well-formed inbound `X-Request-ID` (e.g. propagated by an upstream proxy or
 * a retried client request) and otherwise generates a fresh one. The final ID
 * is always echoed back on the response, after the rest of the chain runs, so
 * a failed request can still be looked up by its ID.
 */
export const requestIdMiddleware = createMiddleware<ApiEnv>(async (c, next) => {
  const inbound = c.req.header("X-Request-ID");
  const id = inbound && VALID_REQUEST_ID.test(inbound) ? inbound : randomUUID();
  c.set("requestId", id);
  await next();
  c.header("X-Request-ID", id);
});
