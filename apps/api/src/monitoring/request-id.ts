import { randomUUID } from "node:crypto";
import { createMiddleware } from "hono/factory";
import { matchedRoutes } from "hono/route";
import { registerApiMonitoringRoutes } from "./sanitize-event";

/**
 * Hono `Env` shared by the whole API: every route and downstream middleware
 * can read the per-request correlation ID set by {@link requestIdMiddleware}.
 */
export type ApiEnv = { Variables: { requestId: string } };

/**
 * Correlates a request across logs, Sentry, and the client with a fresh
 * server-generated UUID. An inbound ID can contain a credential or Brief
 * token even when it looks like an opaque ID or UUID, so it is never copied.
 * The final ID
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
  // These are Hono's registered templates, never the URL or parameter values.
  registerApiMonitoringRoutes(matchedRoutes(c));
  const id = randomUUID();
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
