import { createMiddleware } from "hono/factory";
import { auth } from "../auth";

export type OptionalVars = { userId?: string };

export const optionalUser = createMiddleware<{ Variables: OptionalVars }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session) c.set("userId", session.user.id);
  await next();
});
