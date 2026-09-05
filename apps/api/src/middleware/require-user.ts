import { createMiddleware } from "hono/factory";
import { getAuthoritativeSession } from "../auth/session";

export type Vars = { userId: string; sessionId: string };

export const requireUser = createMiddleware<{ Variables: Vars }>(async (c, next) => {
  const session = await getAuthoritativeSession(c.req.raw.headers);
  if (!session) return c.json({ error: "unauthorized" } as const, 401);
  if (session.user.emailVerified !== true) {
    return c.json({ error: "email_unverified" } as const, 403);
  }
  c.set("userId", session.user.id);
  c.set("sessionId", session.session.id);
  await next();
});
