# Admin Bootstrap Self-Heal — Design Spec

**Date:** 2026-05-18
**Status:** Approved (bugfix)
**Topic:** Make `ADMIN_EMAILS` lazy-promotion fire on the path the web guard actually uses

## Problem

Shipped in PR #3, the admin portal is unreachable for a freshly-allowlisted
user — a bootstrap deadlock:

- The web `RequireAdmin` guard calls `GET /me` and renders the dashboard only
  if `data.user.role === 'admin'`; otherwise it redirects to `/app`.
- `/me` returns `session.user` verbatim and does **not** run the
  `ADMIN_EMAILS` lazy-promotion.
- The only code that promotes (`UPDATE "user" SET role='admin'`) lives in the
  `requireAdmin` middleware, which gates `/api/admin/*`.
- The guard redirects to `/app` **before** the dashboard ever calls
  `/api/admin/*`, so the promotion never fires. An allowlisted user can never
  become admin through the UI.

Root cause: the self-healing bootstrap was attached to one route group
(`/api/admin/*`) instead of "any authenticated request" as the original
telemetry spec intended. The web guard's source of truth (`/me`) is not a
promoting path.

## Fix

Extract the promotion logic into one shared, dependency-injectable helper and
invoke it on **both** the guard's source of truth (`/me`) and the API gate
(`requireAdmin`), so behavior is identical and the allowlist self-heals on the
first authenticated request regardless of which endpoint it hits.

### `resolveAdminRole` (new: `apps/api/src/auth/admin-bootstrap.ts`)

```
resolveAdminRole(
  sessionUser: { id: string; email: string; role?: string },
  deps?: { database?: DB; adminEmails?: string[] },
): Promise<"user" | "admin">
```

- `adminEmails` defaults to `env.ADMIN_EMAILS`, `database` to `db` (DI for tests).
- Lowercase the user email; `onAllowlist = adminEmails.includes(email)`.
- `role = sessionUser.role ?? "user"`.
- If `onAllowlist && role !== "admin"`: `UPDATE "user" SET role='admin' WHERE id=…`; return `"admin"`.
- Else return `role` (`"user" | "admin"`).
- Promote-only (unchanged policy): removal from `ADMIN_EMAILS` does not revoke a
  persisted role; revocation needs a direct DB change.

### Call sites

- **`requireAdmin`** (`middleware/require-admin.ts`): replace the inline
  email/allowlist/promote block with `const role = await resolveAdminRole(session.user)`;
  keep the existing `401` (no session) / `403` (role !== "admin") / `c.set("adminUser", …)` behavior unchanged.
- **`/me`** (`app.ts`): after `getSession`, `const role = await resolveAdminRole(session.user)`;
  return `c.json({ user: { ...session.user, role } })` so the web guard sees the
  effective (post-promotion) role on first authenticated load.

No web changes: `RequireAdmin` already reads `data.user.role` from `/me`.

## Testing

- **Unit** (`auth/admin-bootstrap.test.ts`, DI fakes — no env coupling):
  not-on-list → returns existing role, no DB write; on-list & role "user" →
  DB update called, returns "admin"; on-list & already "admin" → no DB write,
  returns "admin"; email match is case-insensitive.
- **Integration** (`me-admin.test.ts`): a DB-seeded `role='admin'` user signs
  in → `GET /me` returns `user.role === "admin"` (proves `/me` now surfaces the
  effective role); a normal user → `user.role === "user"`.
- **Regression:** existing `require-admin.test.ts` (401/403, no promotion for
  non-allowlist) and `routes/admin.test.ts` stay green after the refactor.

## Scope boundaries

No change to: the promote-only policy, retention, telemetry capture, dashboard
UI, or env schema. No new endpoints. Behavior of `requireAdmin` is preserved
exactly (same status codes, same `adminUser` context var).
