# Auth Rate Limiting (Security P1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Throttle abuse of the public auth endpoints with Better Auth's Postgres-backed limiter, plus a lenient in-memory global safety net on the rest of the API.

**Architecture:** Two layers in `apps/api`. (1) Better Auth `rateLimit: storage:"database"` with strict `customRules` on sign-in/sign-up, keyed on the Fly-forwarded client IP — counters in a new Drizzle `rateLimit` table (migration `0001`, applied by the existing CI migrate job). (2) A small in-memory fixed-window Hono middleware giving every non-auth, non-`/health` route a generous per-IP cap.

**Tech Stack:** Hono, Better Auth 1.6.11, Drizzle ORM + drizzle-kit, Postgres, Vitest (existing api Postgres test service).

**Spec:** `docs/superpowers/specs/2026-05-17-rate-limiting-design.md`

**Conventions:** Work on `main` (continuously deployed; user pushes at cycle end). gpg-unsigned commits ending with:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
`git -c commit.gpgsign=false commit -m "<subject>" -m "<trailer>"`. Run api commands with env loaded: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api <cmd>`. No new runtime deps. No changes outside `apps/api` (+ this plan/spec doc).

**Better Auth API note:** prior tasks confirmed Better Auth 1.6.11 option types live in `@better-auth/core` `init-options`. The `rateLimit` and `advanced.ipAddress` shapes below are the documented 1.6 API. If `tsc` rejects a field, the implementer must verify the installed type and make the **minimal** documented adjustment (e.g., a renamed key), not silently drop rate limiting — and report the deviation.

---

## File Structure

```
apps/api/
  src/
    db/schema.ts                 MODIFY  add `rateLimit` pgTable (Better Auth storage:"database")
    auth.ts                      MODIFY  rateLimit config + advanced.ipAddress + adapter schema map
    middleware/rate-limit.ts     CREATE  createRateLimiter() + globalRateLimit() Hono middleware
    middleware/rate-limit.test.ts CREATE TDD unit/integration for the global net
    app.ts                       MODIFY  mount globalRateLimit() (after CORS, excludes /health + /api/auth/*)
    app.test.ts                  MODIFY  add: /health never throttled; Better Auth /sign-in/email 429 after rule
  drizzle/0001_*.sql             CREATE  generated migration for rate_limit table
  drizzle/meta/*                 MODIFY  drizzle-kit journal/snapshot for 0001
```

---

## Task 1: `rateLimit` table + migration

**Files:** Modify `apps/api/src/db/schema.ts`; Create `apps/api/drizzle/0001_*.sql` (+ meta) via drizzle-kit

- [ ] **Step 1: Read the current schema head to match style**

Run: `sed -n '1,20p' apps/api/src/db/schema.ts`
Expected: drizzle-orm `pgTable`/`text`/`integer`/`timestamp` imports and the hand-defined Better Auth tables (`user`, `session`, `account`, `verification`). Match that style.

- [ ] **Step 2: Add the `rateLimit` table**

Append to `apps/api/src/db/schema.ts` (ensure `bigint` is in the `drizzle-orm/pg-core` import — add it if missing). Better Auth's `database` rate-limit model expects fields `id`, `key`, `count`, `lastRequest`; the Drizzle property names must equal those Better Auth field names (DB column names may be snake_case, as with the other auth tables). `lastRequest` is `Date.now()` epoch-ms (~1.7e12, exceeds int4) → `bigint` with `mode: "number"`:

```ts
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
```

- [ ] **Step 3: Typecheck**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api typecheck`
Expected: 0 errors (table only; not yet referenced by auth.ts — that's Task 4).

- [ ] **Step 4: Generate the migration**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api db:generate`
Expected: creates `apps/api/drizzle/0001_*.sql` containing `CREATE TABLE "rate_limit"` (id pk, key, count, last_request bigint) and updates `apps/api/drizzle/meta/_journal.json` + a new snapshot. No changes to `0000_*`.

- [ ] **Step 5: Verify it applies cleanly to a fresh DB**

```bash
docker compose down -v >/dev/null 2>&1 && docker compose up -d --wait >/dev/null 2>&1
set -a && . ./.env && set +a && pnpm --filter @turingcare/api db:migrate
docker compose exec -T postgres psql -U postgres -d turingcare -c "\dt" | grep -c -E 'user|session|account|verification|dogs|behavior_concerns|training_goals|journal_entries|briefs|trainers|rate_limit'
docker compose exec -T postgres psql -U postgres -d turingcare -c "\d rate_limit"
```
Expected: migrations apply with no error; table count line prints `11`; `\d rate_limit` shows `id` pk, `key`, `count` integer, `last_request` bigint.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle
git -c commit.gpgsign=false commit -m "feat(api): rateLimit table + migration 0001" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Global in-memory rate-limit middleware (TDD)

**Files:** Create `apps/api/src/middleware/rate-limit.ts`, `apps/api/src/middleware/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/middleware/rate-limit.test.ts`:

```ts
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createRateLimiter, globalRateLimit } from "./rate-limit";

describe("createRateLimiter", () => {
  it("allows up to max within the window, then limits", () => {
    const check = createRateLimiter({ windowMs: 1000, max: 2 });
    expect(check("a", 0).limited).toBe(false); // 1
    expect(check("a", 100).limited).toBe(false); // 2
    const third = check("a", 200); // 3 > max
    expect(third.limited).toBe(true);
    expect(third.retryAfter).toBeGreaterThan(0);
  });

  it("resets after the window elapses", () => {
    const check = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(check("b", 0).limited).toBe(false);
    expect(check("b", 500).limited).toBe(true);
    expect(check("b", 1000).limited).toBe(false); // new window
  });

  it("tracks keys independently", () => {
    const check = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(check("x", 0).limited).toBe(false);
    expect(check("y", 0).limited).toBe(false);
    expect(check("x", 0).limited).toBe(true);
  });
});

describe("globalRateLimit middleware", () => {
  function app(max: number) {
    return new Hono()
      .use("*", globalRateLimit({ windowMs: 60_000, max }))
      .get("/health", (c) => c.json({ status: "ok" }))
      .get("/thing", (c) => c.json({ ok: true }))
      .on(["POST", "GET"], "/api/auth/*", (c) => c.json({ auth: true }));
  }

  it("429s a normal route past the limit with Retry-After", async () => {
    const a = app(1);
    expect((await a.request("/thing")).status).toBe(200);
    const res = await a.request("/thing");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await res.json()).toEqual({
      error: "rate_limited",
      retryAfter: expect.any(Number),
    });
  });

  it("never throttles /health", async () => {
    const a = app(1);
    for (let i = 0; i < 5; i++) {
      expect((await a.request("/health")).status).toBe(200);
    }
  });

  it("does not touch /api/auth/* (Better Auth owns those)", async () => {
    const a = app(1);
    expect((await a.request("/api/auth/x")).status).toBe(200);
    expect((await a.request("/api/auth/x")).status).toBe(200); // not 429
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api test rate-limit`
Expected: FAIL — cannot resolve `./rate-limit`.

- [ ] **Step 3: Implement `apps/api/src/middleware/rate-limit.ts`**

```ts
import type { MiddlewareHandler } from "hono";

type Bucket = { count: number; windowStart: number };

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

/**
 * Fixed-window per-key counter. `now` is injected for deterministic tests.
 * In-memory and per-process by design (the security-critical limiter is Better
 * Auth's DB-backed one); this is only a coarse global safety net.
 */
export function createRateLimiter(opts: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  return function check(key: string, now: number): { limited: boolean; retryAfter: number } {
    const b = buckets.get(key);
    if (!b || now - b.windowStart >= opts.windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      if (buckets.size > 5000) {
        for (const [k, v] of buckets) {
          if (now - v.windowStart >= opts.windowMs) buckets.delete(k);
        }
      }
      return { limited: false, retryAfter: 0 };
    }
    b.count += 1;
    if (b.count > opts.max) {
      return {
        limited: true,
        retryAfter: Math.ceil((opts.windowMs - (now - b.windowStart)) / 1000),
      };
    }
    return { limited: false, retryAfter: 0 };
  };
}

function clientIp(headers: Headers): string {
  return (
    headers.get("fly-client-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Lenient global net. Skips /health (liveness) and /api/auth/* (Better Auth's own limiter). */
export function globalRateLimit(
  opts: RateLimitOptions = { windowMs: 60_000, max: 300 },
): MiddlewareHandler {
  const check = createRateLimiter(opts);
  return async (c, next) => {
    const path = c.req.path;
    if (path === "/health" || path.startsWith("/api/auth/")) return next();
    const { limited, retryAfter } = check(clientIp(c.req.raw.headers), Date.now());
    if (limited) {
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "rate_limited", retryAfter } as const, 429);
    }
    return next();
  };
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api test rate-limit`
Expected: PASS — all cases green.

- [ ] **Step 5: Typecheck + commit**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api typecheck` → 0 errors.

```bash
git add apps/api/src/middleware/rate-limit.ts apps/api/src/middleware/rate-limit.test.ts
git -c commit.gpgsign=false commit -m "feat(api): in-memory global rate-limit middleware" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Mount the global middleware in `app.ts`

**Files:** Modify `apps/api/src/app.ts`

- [ ] **Step 1: Read the current file**

Run: `cat apps/api/src/app.ts`
Expected: a single chained `new Hono()` with `.use("*", cors({...}))` then `.get("/health"...)`, `.get("/me"...)`, `.post("/api/validate/*"...)`, `.on(["POST","GET"], "/api/auth/*", ...)`, then `export { app }; export type AppType = typeof app;`. The chaining must be preserved (it carries `AppType` for the web RPC client).

- [ ] **Step 2: Add the import and mount the middleware right after the CORS `.use`**

Add to the imports:
```ts
import { globalRateLimit } from "./middleware/rate-limit";
```
Insert a second `.use("*", globalRateLimit())` immediately **after** the existing `.use("*", cors({...}))` call and **before** `.get("/health", ...)`. Concretely the chain becomes:

```ts
const app = new Hono()
  .use(
    "*",
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      allowHeaders: ["Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
  )
  .use("*", globalRateLimit())
  .get("/health", (c) => c.json({ status: "ok" } as const))
  // ...rest of the chain UNCHANGED...
```
Do not change any route, the `export { app }`, or the `AppType` export. `globalRateLimit()` internally exempts `/health` and `/api/auth/*`, so middleware order is safe.

- [ ] **Step 3: Add regression + wiring assertions to `apps/api/src/app.test.ts`**

Append these tests (keep the existing `/health` 200 and `/me` 401 tests intact — import `app` is already present):

```ts
it("GET /health is never rate-limited", async () => {
  for (let i = 0; i < 50; i++) {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  }
});
```

- [ ] **Step 4: Run the api tests**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api test`
Expected: PASS — existing `/health` 200 + `/me` 401, the new `/health` not-limited loop, and the Task 2 middleware suite all green. (`/me` 401 still works: it's under the lenient 300/window global cap and not exempt-needed for a single call.)

- [ ] **Step 5: Typecheck + commit**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api typecheck` → 0 errors. Confirm `grep -n "AppType" apps/api/src/app.ts` still shows `export type AppType = typeof app;`.

```bash
git add apps/api/src/app.ts apps/api/src/app.test.ts
git -c commit.gpgsign=false commit -m "feat(api): mount global rate-limit middleware" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Better Auth limiter config + IP headers + adapter schema map

**Files:** Modify `apps/api/src/auth.ts`; Modify `apps/api/src/app.test.ts`

- [ ] **Step 1: Read the current file**

Run: `cat apps/api/src/auth.ts`
Expected: imports (`betterAuth`, `drizzleAdapter`, `db`, `* as schema`, `env`); a `const advanced = env.COOKIE_DOMAIN ? {...} : undefined;`; `betterAuth({ secret, baseURL, basePath:"/api/auth", trustedOrigins:[env.FRONTEND_URL], emailAndPassword:{enabled:true}, advanced, database: drizzleAdapter(db,{provider:"pg",schema:{user,session,account,verification}}) })`; `export type Auth = typeof auth;`.

- [ ] **Step 2: Replace the file with the rate-limit-enabled version**

`apps/api/src/auth.ts` (this preserves the existing cookie behavior — `advanced.ipAddress` is always set; the cross-subdomain cookie keys are still only added when `COOKIE_DOMAIN` is set — and adds `rateLimit` + the `rateLimit` table to the adapter schema map):

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import * as schema from "./db/schema";
import { env } from "./env";

// Fly terminates TLS and forwards the real client IP. Without this Better Auth
// cannot key the limiter on the client and logs "Rate limiting skipped: could
// not determine client IP address". Cross-subdomain cookie attrs are still only
// applied in production (when COOKIE_DOMAIN is set).
const advanced = {
  ipAddress: { ipAddressHeaders: ["fly-client-ip", "x-forwarded-for"] },
  ...(env.COOKIE_DOMAIN
    ? {
        crossSubDomainCookies: { enabled: true, domain: env.COOKIE_DOMAIN },
        defaultCookieAttributes: { sameSite: "none" as const, secure: true },
      }
    : {}),
};

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  trustedOrigins: [env.FRONTEND_URL],
  emailAndPassword: { enabled: true },
  advanced,
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/forget-password": { window: 60, max: 3 },
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      rateLimit: schema.rateLimit,
    },
  }),
});

export type Auth = typeof auth;
```

- [ ] **Step 3: Typecheck (verify the Better Auth 1.6.11 option shapes)**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api typecheck`
Expected: 0 errors. If Better Auth's installed types reject `rateLimit.storage`, `customRules`, or `advanced.ipAddress.ipAddressHeaders`, inspect `node_modules/.pnpm/@better-auth+core@*/.../init-options.d.*` for the exact field name/shape and make the **minimal** documented change (e.g., a key rename) preserving identical behavior; report the deviation. Do not remove rate limiting to make types pass.

- [ ] **Step 4: Add the Better Auth limiter integration test to `apps/api/src/app.test.ts`**

Better Auth only enforces when it can resolve a client IP — the test must send one of the configured headers. `/sign-in/email` rule is `max: 5` per 60 s; the 6th attempt from the same IP returns 429.

```ts
it("rate-limits repeated /api/auth/sign-in/email from one IP", async () => {
  const body = JSON.stringify({ email: "rl@example.com", password: "wrongpass-123" });
  const headers = { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7" };
  let last: Response | undefined;
  for (let i = 0; i < 6; i++) {
    last = await app.request("/api/auth/sign-in/email", { method: "POST", body, headers });
  }
  expect(last?.status).toBe(429);
  expect(Number(last?.headers.get("Retry-After"))).toBeGreaterThan(0);
});
```

- [ ] **Step 5: Run api tests (needs Postgres + the 0001 migration applied)**

```bash
docker compose up -d --wait >/dev/null 2>&1
set -a && . ./.env && set +a && pnpm --filter @turingcare/api db:migrate >/dev/null
set -a && . ./.env && set +a && pnpm --filter @turingcare/api test
```
Expected: PASS — including the new rate-limit integration test (6th sign-in → 429 + Retry-After) and all prior api tests. If the integration test gets no 429: confirm `rateLimit.enabled` is `true`, the `rate_limit` table exists (Task 1 migration applied), and the `x-forwarded-for` header is in `advanced.ipAddress.ipAddressHeaders`. Report precisely if Better Auth's rule-key path differs from `/sign-in/email` (it is relative to `basePath`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth.ts apps/api/src/app.test.ts
git -c commit.gpgsign=false commit -m "feat(api): Better Auth DB-backed rate limiting + Fly IP headers" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Full verification gate

No code changes — gate before the cycle's final review/push. Fix-and-rerun on any failure.

- [ ] **Step 1: Fresh DB migrate proves the deploy `migrate` job will work**

```bash
docker compose down -v >/dev/null 2>&1 && docker compose up -d --wait >/dev/null 2>&1
set -a && . ./.env && set +a && pnpm --filter @turingcare/api db:migrate
docker compose exec -T postgres psql -U postgres -d turingcare -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" | sed -n '3p'
```
Expected: clean apply; count `11` (10 prior + `rate_limit`).

- [ ] **Step 2: Static + test gates (all must pass)**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/api typecheck      # 0 errors
pnpm lint                                    # 0 errors
pnpm -r exec tsc --noEmit                    # exit 0
pnpm -r test                                 # shared 3 + api (prior + 3 new groups) + web 6, all green
pnpm -r build                                # all workspaces build
```

- [ ] **Step 3: Scope / dependency drift check**

```bash
git status --porcelain
git diff --stat origin/main -- package.json pnpm-lock.yaml apps/web
```
Expected: clean tree; **no** changes to `package.json`, `pnpm-lock.yaml`, or `apps/web` for this sub-project (only `apps/api/*` + `docs/*`). No new runtime deps.

- [ ] **Step 4: Manual sanity (optional, local)**

With `pnpm --filter @turingcare/api dev` running (env loaded), 6 rapid:
`curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3001/api/auth/sign-in/email -H "Content-Type: application/json" -H "x-forwarded-for: 198.51.100.9" -d '{"email":"x@x.com","password":"nope"}'`
Expected: first attempts non-429, the 6th `429`. Stop the dev server after.

- [ ] **Step 5: Report** the gate results for the final review. No commit (no changes) unless a fix was needed.

---

## Self-Review

**Spec coverage:** Better Auth `storage:"database"` limiter with `window/max` + strict `customRules` (sign-in/sign-up 5/60, forget-password 3/60) + global default 100/60 → Task 4; `rateLimit` table + `0001` migration applied by existing CI job → Task 1; Fly IP via `advanced.ipAddress.ipAddressHeaders` (merged, not replacing the cookie `advanced`) → Task 4; in-memory global net 300/60 excluding `/health` + `/api/auth/*` → Tasks 2–3; 429 + `Retry-After` (both layers) → Tasks 2,4; tests (global unit/middleware, `/health` exempt, BA integration 429, existing api regressions) → Tasks 2,3,4; fresh-DB migrate + full gate + scope/no-dep guard → Tasks 1,5; AppType chaining preserved → Task 3 Step 5. All spec sections mapped, including the flagged in-memory-global decision and the conservative thresholds.

**Placeholder scan:** none — full code for schema, middleware, auth.ts, every test; exact commands with expected output; the Better Auth type-mismatch contingency is a concrete "inspect init-options.d, minimal documented rename, report" instruction, not a TODO.

**Type/consistency:** `rateLimit` Drizzle export name used identically in Task 1 (schema.ts) and Task 4 (`schema.rateLimit` in the adapter map); field/property names `id/key/count/lastRequest` match Better Auth's `database` model; `createRateLimiter`/`globalRateLimit` signatures and the `{ limited, retryAfter }` shape consistent across Task 2 impl, its tests, and the Task 3 mount; 429 body `{ error: "rate_limited", retryAfter }` identical in middleware and its test; `customRules` keys are `basePath`-relative (`/sign-in/email`) consistently in auth.ts and the Task 4 integration test (which posts to `/api/auth/sign-in/email`).
