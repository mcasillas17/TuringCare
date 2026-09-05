import { and, eq } from "drizzle-orm";
import { type DB, db as defaultDb } from "../db";
import { user } from "../db/schema";
import { env } from "../env";

export type Role = "user" | "admin";

export interface ResolveAdminRoleDeps {
  database?: DB;
  adminEmails?: string[];
}

/**
 * Accepts an authoritative session user. Only a verified user's (lower-cased)
 * email may bootstrap 'admin' from the ADMIN_EMAILS allowlist. Promote-only:
 * removal from the allowlist never revokes a persisted role (revocation
 * requires a direct DB change). Shared by `requireAdmin` and `/me` so the
 * bootstrap self-heals on the first verified request, whichever path. Persisted
 * admin roles remain ineffective while email ownership is unverified.
 */
export async function resolveAdminRole(
  sessionUser: { id: string; email: string; emailVerified?: boolean; role?: string | null },
  deps: ResolveAdminRoleDeps = {},
): Promise<Role> {
  const database = deps.database ?? defaultDb;
  const adminEmails = deps.adminEmails ?? env.ADMIN_EMAILS;
  if (sessionUser.emailVerified !== true) return "user";

  const email = sessionUser.email.toLowerCase();
  const role: Role = sessionUser.role === "admin" ? "admin" : "user";

  if (adminEmails.includes(email) && role !== "admin") {
    const promoted = await database
      .update(user)
      .set({ role: "admin" })
      .where(and(eq(user.id, sessionUser.id), eq(user.emailVerified, true)))
      .returning({ id: user.id });
    return promoted.length ? "admin" : "user";
  }
  return role;
}
