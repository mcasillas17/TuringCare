# Admin Bootstrap Self-Heal — Implementation Plan

**Goal:** Fire the `ADMIN_EMAILS` lazy-promotion on `/me` (the web guard's source of truth), not only on `/api/admin/*`, via one shared helper.

**Spec:** `docs/superpowers/specs/2026-05-18-admin-bootstrap-selfheal-design.md`

**Tech:** Hono, Drizzle, Better Auth, Vitest. Vitest auto-loads `.env`; Postgres `turingcare-postgres` running.

---

## Task 1: `resolveAdminRole` shared helper (TDD)

**Files:** Create `apps/api/src/auth/admin-bootstrap.ts`; Test `apps/api/src/auth/admin-bootstrap.test.ts`

- [ ] **Step 1 — failing test** `apps/api/src/auth/admin-bootstrap.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { resolveAdminRole } from "./admin-bootstrap";

function fakeDb() {
  const set = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  const update = vi.fn().mockReturnValue({ set });
  return { db: { update } as unknown as Parameters<typeof resolveAdminRole>[1] extends infer D ? never : never, update, set };
}

describe("resolveAdminRole", () => {
  it("returns existing role and does NOT write when email is not on the allowlist", async () => {
    const update = vi.fn();
    const db = { update } as unknown as NonNullable<Parameters<typeof resolveAdminRole>[1]>["database"];
    const role = await resolveAdminRole(
      { id: "u1", email: "nobody@example.com", role: "user" },
      { database: db, adminEmails: ["admin@x.com"] },
    );
    expect(role).toBe("user");
    expect(update).not.toHaveBeenCalled();
  });

  it("promotes (DB write) and returns 'admin' when on allowlist and role is user", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    const db = { update } as unknown as NonNullable<Parameters<typeof resolveAdminRole>[1]>["database"];
    const role = await resolveAdminRole(
      { id: "u1", email: "Admin@X.com", role: "user" },
      { database: db, adminEmails: ["admin@x.com"] },
    );
    expect(role).toBe("admin");
    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ role: "admin" });
  });

  it("is idempotent: already admin on allowlist → no DB write", async () => {
    const update = vi.fn();
    const db = { update } as unknown as NonNullable<Parameters<typeof resolveAdminRole>[1]>["database"];
    const role = await resolveAdminRole(
      { id: "u1", email: "admin@x.com", role: "admin" },
      { database: db, adminEmails: ["admin@x.com"] },
    );
    expect(role).toBe("admin");
    expect(update).not.toHaveBeenCalled();
  });

  it("defaults missing role to 'user'", async () => {
    const update = vi.fn();
    const db = { update } as unknown as NonNullable<Parameters<typeof resolveAdminRole>[1]>["database"];
    const role = await resolveAdminRole(
      { id: "u1", email: "x@y.com" },
      { database: db, adminEmails: [] },
    );
    expect(role).toBe("user");
    expect(update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 — run, expect FAIL** `pnpm --filter @turingcare/api exec vitest run src/auth/admin-bootstrap.test.ts` (module missing).

- [ ] **Step 3 — implement** `apps/api/src/auth/admin-bootstrap.ts`:

```ts
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
```

- [ ] **Step 4 — run, expect PASS** (4 tests). `pnpm --filter @turingcare/api exec vitest run src/auth/admin-bootstrap.test.ts`

- [ ] **Step 5 — commit** `git add apps/api/src/auth/ && git commit -m "feat(api): shared resolveAdminRole bootstrap helper"`

## Task 2: Use it in `requireAdmin` (refactor, behavior-preserving)

**Files:** Modify `apps/api/src/middleware/require-admin.ts`

- [ ] **Step 1** Replace the inline email/allowlist/promote block with the helper. New body:

```ts
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
```

- [ ] **Step 2 — regression** `pnpm --filter @turingcare/api exec vitest run src/middleware/require-admin.test.ts src/routes/admin.test.ts` → all still pass (401/403/200, no-promotion-for-non-allowlist).
- [ ] **Step 3 — commit** `git add apps/api/src/middleware/require-admin.ts && git commit -m "refactor(api): requireAdmin uses shared resolveAdminRole"`

## Task 3: Fire it on `/me` + integration test

**Files:** Modify `apps/api/src/app.ts`; Test `apps/api/src/me-admin.test.ts`

- [ ] **Step 1 — failing integration test** `apps/api/src/me-admin.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "./app";
import { auth } from "./auth";
import { db } from "./db";
import { user } from "./db/schema";

const adminEmail = `me_adm_${Date.now()}@example.com`;
const plainEmail = `me_usr_${Date.now()}@example.com`;

afterAll(async () => {
  await db.delete(user).where(eq(user.email, adminEmail));
  await db.delete(user).where(eq(user.email, plainEmail));
});

async function signInCookie(email: string) {
  await auth.api.signUpEmail({ body: { name: "Me", email, password: "password-123" } });
  const res = await auth.api.signInEmail({
    body: { email, password: "password-123" },
    asResponse: true,
  });
  return res.headers.get("set-cookie") ?? "";
}

describe("GET /me surfaces effective role", () => {
  it("returns role 'admin' for a DB-seeded admin", async () => {
    const cookie = await signInCookie(adminEmail);
    await db.update(user).set({ role: "admin" }).where(eq(user.email, adminEmail));
    const res = await app.request("/me", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { role?: string } };
    expect(body.user.role).toBe("admin");
  });

  it("returns role 'user' for a normal account", async () => {
    const cookie = await signInCookie(plainEmail);
    const res = await app.request("/me", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { role?: string } };
    expect(body.user.role).toBe("user");
  });
});
```

- [ ] **Step 2 — run, expect FAIL** on the admin case if `/me` doesn't surface role reliably: `pnpm --filter @turingcare/api exec vitest run src/me-admin.test.ts`. (If it already passes because Better Auth happens to include role, still proceed — Step 3 makes it correct-by-construction and adds the bootstrap.)

- [ ] **Step 3 — implement** In `apps/api/src/app.ts` add import `import { resolveAdminRole } from "./auth/admin-bootstrap";` and change the `/me` handler to:

```ts
  .get("/me", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "unauthorized" } as const, 401);
    const role = await resolveAdminRole(session.user);
    return c.json({ user: { ...session.user, role } });
  })
```

- [ ] **Step 4 — run, expect PASS** `pnpm --filter @turingcare/api exec vitest run src/me-admin.test.ts` (2 tests).
- [ ] **Step 5 — commit** `git add apps/api/src/app.ts apps/api/src/me-admin.test.ts && git commit -m "fix(api): /me surfaces effective role + ADMIN_EMAILS self-heal"`

## Task 4: Full gate + docs + PR

- [ ] **Step 1 — full gate** (from worktree, `.env` auto-loaded by vitest; export for build):
```bash
set -a && . ./.env && set +a
pnpm biome check . && pnpm -r exec tsc --noEmit && pnpm -r test && pnpm -r build
```
All green. Fix any biome/format fallout (re-run).

- [ ] **Step 2 — PROJECT-LOG** Append a `## 2026-05-18 — Admin bootstrap self-heal (hotfix) — SHIPPED` entry referencing this spec/plan and the root cause.
- [ ] **Step 3 — commit** `git add docs/PROJECT-LOG.md && git commit -m "docs: PROJECT-LOG entry for admin bootstrap self-heal"`
- [ ] **Step 4 — push + PR** Push the branch; open a PR against `main` via the GitHub REST API (stored credential), title `fix: admin bootstrap self-heal (/me promotion)`, body summarizing the deadlock + fix + test plan.

## Self-Review

Spec coverage: helper (T1) ✓ · requireAdmin refactor preserves 401/403/adminUser (T2) ✓ · `/me` fires helper + integration (T3) ✓ · gate + docs + PR (T4) ✓. No placeholders. Types: `resolveAdminRole(sessionUser, deps)` signature consistent across helper, `requireAdmin`, `/me`, and tests. No behavior change to `requireAdmin` status codes.
