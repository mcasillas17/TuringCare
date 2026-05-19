import { eq } from "drizzle-orm";
import { db as defaultDb, type DB } from "../db";
import { user } from "../db/schema";
import { env } from "../env";

export type Role = "user" | "admin";

export interface ResolveAdminRoleDeps {
  database?: DB;
  adminEmails?: string[];
}

/**
 * Returns the user's effective role, lazily promoting to 'admin' when the
 * (lower-cased) email is on the ADMIN_EMAILS allowlist. Promote-only:
 * removal from the allowlist never revokes a persisted role (revocation
 * requires a direct DB change). Shared by `requireAdmin` and `/me` so the
 * bootstrap self-heals on the first authenticated request, whichever path.
 */
export async function resolveAdminRole(
  sessionUser: { id: string; email: string; role?: string },
  deps: ResolveAdminRoleDeps = {},
): Promise<Role> {
  const database = deps.database ?? defaultDb;
  const adminEmails = deps.adminEmails ?? env.ADMIN_EMAILS;

  const email = sessionUser.email.toLowerCase();
  const role: Role = sessionUser.role === "admin" ? "admin" : "user";

  if (adminEmails.includes(email) && role !== "admin") {
    await database.update(user).set({ role: "admin" }).where(eq(user.id, sessionUser.id));
    return "admin";
  }
  return role;
}
