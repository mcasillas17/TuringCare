import { createMiddleware } from "hono/factory";
import { getAuthoritativeSession } from "../auth/session";

export type OptionalVars = { userId?: string };

export const optionalUser = createMiddleware<{ Variables: OptionalVars }>(async (c, next) => {
  const session = await getAuthoritativeSession(c.req.raw.headers);
  if (session?.user.emailVerified === true) c.set("userId", session.user.id);
  await next();
});
