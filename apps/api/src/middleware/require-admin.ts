import type { MiddlewareHandler } from "hono";
import { auth } from "../auth";
import { resolveAdminRole } from "../auth/admin-bootstrap";

export interface AdminVars {
  adminUser: { id: string; email: string };
}

/**
 * Gate for /api/admin/*. 401 if anonymous, 403 if authenticated non-admin.
 * Self-healing bootstrap (shared with /me via resolveAdminRole): an
 * ADMIN_EMAILS user is lazily promoted to role='admin'. Promote-only —
 * removal from ADMIN_EMAILS does not revoke a persisted role.
 */
export const requireAdmin: MiddlewareHandler<{ Variables: AdminVars }> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" } as const, 401);

  const role = await resolveAdminRole(session.user);
  if (role !== "admin") return c.json({ error: "forbidden" } as const, 403);

  c.set("adminUser", { id: session.user.id, email: session.user.email.toLowerCase() });
  return next();
};
