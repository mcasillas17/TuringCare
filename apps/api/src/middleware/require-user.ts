import { createMiddleware } from "hono/factory";
import { auth } from "../auth";

export type Vars = { userId: string; sessionId: string };

export const requireUser = createMiddleware<{ Variables: Vars }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" } as const, 401);
  c.set("userId", session.user.id);
  c.set("sessionId", session.session.id);
  await next();
});
