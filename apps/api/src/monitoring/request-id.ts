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
 * is always echoed back on the response — in a `finally`, so it lands even
 * when a downstream handler throws — after the rest of the chain runs, so a
 * failed request can still be looked up by its ID.
 *
 * Hono's dispatcher only routes a thrown value to `app.onError` when it is an
 * `Error` instance (see hono's `compose`); anything else — a thrown string,
 * for example — would otherwise bypass `onError` entirely and escape as an
 * unhandled rejection, with no response and no capture. Normalizing here
 * guarantees `onError` (and therefore Sentry capture) always runs, without
 * ever embedding the original thrown value — which may hold sensitive data —
 * in the new Error.
 */
export const requestIdMiddleware = createMiddleware<ApiEnv>(async (c, next) => {
  const inbound = c.req.header("X-Request-ID");
  const id = inbound && VALID_REQUEST_ID.test(inbound) ? inbound : randomUUID();
  c.set("requestId", id);
  try {
    await next();
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error("Non-Error value thrown");
  } finally {
    c.header("X-Request-ID", id);
  }
});
