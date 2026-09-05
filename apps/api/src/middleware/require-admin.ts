import type { MiddlewareHandler } from "hono";
import { resolveAdminRole } from "../auth/admin-bootstrap";
import { getAuthoritativeSession } from "../auth/session";

export interface AdminVars {
  adminUser: { id: string; email: string };
}

/**
 * Gate for /api/admin/*. 401 if anonymous, 403 if unverified or non-admin.
 * Self-healing bootstrap (shared with /me via resolveAdminRole): an
 * verified ADMIN_EMAILS user is lazily promoted to role='admin'. Promote-only —
 * removal from ADMIN_EMAILS does not revoke a persisted role.
 */
export const requireAdmin: MiddlewareHandler<{ Variables: AdminVars }> = async (c, next) => {
  const session = await getAuthoritativeSession(c.req.raw.headers);
  if (!session) return c.json({ error: "unauthorized" } as const, 401);
  if (session.user.emailVerified !== true) {
    return c.json({ error: "email_unverified" } as const, 403);
  }

  const role = await resolveAdminRole(session.user);
  if (role !== "admin") return c.json({ error: "forbidden" } as const, 403);

  c.set("adminUser", { id: session.user.id, email: session.user.email.toLowerCase() });
  return next();
};
