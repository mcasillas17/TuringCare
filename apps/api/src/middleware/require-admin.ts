import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { auth } from "../auth";
import { db } from "../db";
import { user } from "../db/schema";
import { env } from "../env";

export interface AdminVars {
  adminUser: { id: string; email: string };
}

/**
 * Gate for /api/admin/*. 401 if anonymous, 403 if authenticated non-admin.
 * Self-healing bootstrap: any authenticated user whose email is in
 * ADMIN_EMAILS is lazily promoted to role='admin' so the operator is never
 * locked out and admin status becomes queryable data thereafter.
 */
export const requireAdmin: MiddlewareHandler<{ Variables: AdminVars }> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" } as const, 401);

  const email = session.user.email.toLowerCase();
  const onAllowlist = env.ADMIN_EMAILS.includes(email);
  let role = (session.user as { role?: string }).role ?? "user";

  if (onAllowlist && role !== "admin") {
    await db.update(user).set({ role: "admin" }).where(eq(user.id, session.user.id));
    role = "admin";
  }

  if (role !== "admin") return c.json({ error: "forbidden" } as const, 403);

  c.set("adminUser", { id: session.user.id, email });
  return next();
};
