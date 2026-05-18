# Admin Portal & Usage Telemetry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-hosted, first-party telemetry pipeline (events table + capture helper + ingest endpoint) and a guarded `/admin` dashboard so the operator can see how users interact with TuringCare.

**Architecture:** A new `events` table in the existing Postgres receives rows from a non-blocking server-side `recordEvent` helper (wired into Better Auth lifecycle) and a rate-limited `POST /api/events` ingest endpoint (client `page.viewed`). A `requireAdmin` middleware (role column + `ADMIN_EMAILS` self-healing bootstrap) gates `GET /api/admin/metrics` + `/api/admin/activity`, which a single-page Recharts dashboard at `/admin` renders. A scheduled GitHub Actions workflow purges events older than `EVENT_RETENTION_DAYS` (default 180).

**Tech Stack:** Hono, Drizzle ORM, Better Auth, Postgres, Zod, Vitest (API); Vite + React 19, React Router v7, TanStack Query, Recharts, Testing Library (web).

**Spec:** `docs/superpowers/specs/2026-05-17-admin-telemetry-design.md`

---

## File Structure

**API (`apps/api`)**
- `src/db/schema.ts` *(modify)* — `user_role` enum, `user.role` column, `events` table + indexes + relations.
- `drizzle/0002_*.sql` *(generated)* — migration for the above.
- `src/env.ts` *(modify)* — `ADMIN_EMAILS`, `EVENT_RETENTION_DAYS`.
- `src/telemetry/events.ts` *(create)* — known/client event names, ingest Zod schema, `EventName` type.
- `src/telemetry/record-event.ts` *(create)* — non-blocking `recordEvent` helper.
- `src/telemetry/retention.ts` *(create)* — pure `retentionCutoff` + `purgeOldEvents`.
- `src/telemetry/retention-cli.ts` *(create)* — runnable purge entrypoint for CI cron.
- `src/middleware/require-admin.ts` *(create)* — admin gate + lazy `ADMIN_EMAILS` promotion.
- `src/routes/admin.ts` *(create)* — admin sub-app: `/metrics`, `/activity`.
- `src/auth.ts` *(modify)* — `user.additionalFields.role` + `databaseHooks` emitting auth events.
- `src/app.ts` *(modify)* — mount `POST /api/events` and the admin sub-app.
- Test files colocated: `*.test.ts`.
- `.github/workflows/retention.yml` *(create)* — daily scheduled purge.

**Web (`apps/web`)**
- `package.json` *(modify)* — add `recharts`.
- `src/lib/track.ts` *(create)* — `track()` + `PageViewTracker` component.
- `src/routes/admin/require-admin.tsx` *(create)* — admin route guard.
- `src/routes/admin/index.tsx` *(create)* — dashboard shell (Layout A).
- `src/routes/admin/panels/{kpi-strip,growth,active-usage,funnel,activity-feed}.tsx` *(create)* — panels.
- `src/routes/admin/use-metrics.ts` *(create)* — typed query hooks.
- `src/main.tsx` *(modify)* — add `/admin` route + mount `PageViewTracker`.
- Test files colocated.

---

## Task 1: Schema — `user.role`, `events` table, migration

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Generate: `apps/api/drizzle/0002_*.sql`

- [ ] **Step 1: Add the enum, column, table, and relations to schema**

In `apps/api/src/db/schema.ts`, add `index` to the existing `drizzle-orm/pg-core` import:

```ts
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
```

Add the role enum next to the other domain enums (after `briefStatusEnum`):

```ts
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
```

Add a `role` column to the existing `user` table (add this line inside the `user` pgTable object, after `image`):

```ts
  role: userRoleEnum("role").notNull().default("user"),
```

Add the `events` table after the `rateLimit` table:

```ts
/* ---------- Telemetry ---------- */

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    props: jsonb("props").notNull().default(sql`'{}'::jsonb`),
    sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("events_name_created_at_idx").on(t.name, t.createdAt),
    index("events_created_at_idx").on(t.createdAt),
  ],
);
```

Add `jsonb` to the `drizzle-orm/pg-core` import list (alphabetically near `integer`):

```ts
  integer,
  jsonb,
  numeric,
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm --filter @turingcare/api db:generate`
Expected: a new file `apps/api/drizzle/0002_*.sql` is created and `apps/api/drizzle/meta/_journal.json` gains an `idx: 2` entry. The SQL should contain `CREATE TYPE "public"."user_role"`, `ALTER TABLE "user" ADD COLUMN "role"`, `CREATE TABLE "events"`, and two `CREATE INDEX` statements.

- [ ] **Step 3: Apply the migration to the local DB**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/api db:migrate`
Expected: migration `0002` applies with no error.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @turingcare/api typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle/
git commit -m "feat(api): events table + user.role enum (migration 0002)"
```

---

## Task 2: Env vars — `ADMIN_EMAILS`, `EVENT_RETENTION_DAYS`

**Files:**
- Modify: `apps/api/src/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Add the two vars to the env schema**

In `apps/api/src/env.ts`, add inside the `z.object({ ... })` (after `COOKIE_DOMAIN`):

```ts
  // Comma-separated admin email allowlist. Any matching authenticated user is
  // treated as admin and lazily promoted (user.role -> 'admin') so the operator
  // is never locked out. Empty/unset = no bootstrap admins.
  ADMIN_EMAILS: z
    .string()
    .optional()
    .default("")
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  // Events older than this many days are purged by the scheduled retention job.
  EVENT_RETENTION_DAYS: z.coerce.number().int().positive().default(180),
```

- [ ] **Step 2: Document them in `.env.example`**

Append to `.env.example`:

```
# ---- Admin & telemetry ----
# Comma-separated emails that get admin access (and are auto-promoted in the
# user table). Local dev: set to your dev account email.
ADMIN_EMAILS=
# Events older than this many days are deleted by the retention workflow.
EVENT_RETENTION_DAYS=180
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @turingcare/api typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/env.ts .env.example
git commit -m "feat(api): ADMIN_EMAILS + EVENT_RETENTION_DAYS env"
```

---

## Task 3: Telemetry event catalog (`events.ts`)

**Files:**
- Create: `apps/api/src/telemetry/events.ts`
- Test: `apps/api/src/telemetry/events.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/telemetry/events.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eventIngestSchema, isKnownEvent } from "./events";

describe("event catalog", () => {
  it("accepts a valid client page.viewed payload", () => {
    const parsed = eventIngestSchema.parse({ name: "page.viewed", props: { path: "/app" } });
    expect(parsed.name).toBe("page.viewed");
    expect(parsed.props).toEqual({ path: "/app" });
  });

  it("defaults props to an empty object", () => {
    const parsed = eventIngestSchema.parse({ name: "page.viewed" });
    expect(parsed.props).toEqual({});
  });

  it("rejects an event name not on the client allowlist", () => {
    expect(() => eventIngestSchema.parse({ name: "user.signed_in", props: {} })).toThrow();
  });

  it("rejects oversized props", () => {
    const big = { path: "x".repeat(2000) };
    expect(() => eventIngestSchema.parse({ name: "page.viewed", props: big })).toThrow();
  });

  it("rejects non-scalar prop values", () => {
    expect(() =>
      eventIngestSchema.parse({ name: "page.viewed", props: { nested: { a: 1 } } }),
    ).toThrow();
  });

  it("isKnownEvent recognizes server event names", () => {
    expect(isKnownEvent("user.signed_up")).toBe(true);
    expect(isKnownEvent("nope.fake")).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/api exec vitest run src/telemetry/events.test.ts`
Expected: FAIL — cannot find module `./events`.

- [ ] **Step 3: Implement the catalog**

Create `apps/api/src/telemetry/events.ts`:

```ts
import { z } from "zod";

/** Every event name the system may record (server- or client-emitted). */
export const KNOWN_EVENTS = [
  "user.signed_up",
  "user.signed_in",
  "page.viewed",
  "dog.created",
  "journal.entry_created",
  "brief.generated",
] as const;

export type EventName = (typeof KNOWN_EVENTS)[number];

const KNOWN = new Set<string>(KNOWN_EVENTS);
export function isKnownEvent(name: string): name is EventName {
  return KNOWN.has(name);
}

/** Names a browser client is allowed to submit via POST /api/events. */
export const CLIENT_EVENTS = ["page.viewed"] as const;

const scalar = z.union([z.string(), z.number(), z.boolean()]);

/** Validated, privacy-safe ingest payload: scalar-only props, size-capped. */
export const eventIngestSchema = z.object({
  name: z.enum(CLIENT_EVENTS),
  props: z
    .record(scalar)
    .default({})
    .refine((p) => JSON.stringify(p).length <= 1024, "props too large"),
});

export type EventIngest = z.infer<typeof eventIngestSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/api exec vitest run src/telemetry/events.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/telemetry/events.ts apps/api/src/telemetry/events.test.ts
git commit -m "feat(api): telemetry event catalog + ingest schema"
```

---

## Task 4: `recordEvent` non-blocking helper

**Files:**
- Create: `apps/api/src/telemetry/record-event.ts`
- Test: `apps/api/src/telemetry/record-event.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/telemetry/record-event.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { recordEvent } from "./record-event";

function fakeDb(insertImpl: () => Promise<unknown>) {
  return {
    insert: () => ({ values: insertImpl }),
  } as unknown as Parameters<typeof recordEvent>[2];
}

describe("recordEvent", () => {
  it("inserts a row with name, userId, sessionId, props", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const db = { insert: () => ({ values }) } as unknown as Parameters<typeof recordEvent>[2];
    await recordEvent("user.signed_in", { userId: "u1", sessionId: "s1", props: { a: 1 } }, db);
    expect(values).toHaveBeenCalledWith({
      name: "user.signed_in",
      userId: "u1",
      sessionId: "s1",
      props: { a: 1 },
    });
  });

  it("defaults userId/sessionId to null and props to {}", async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const db = { insert: () => ({ values }) } as unknown as Parameters<typeof recordEvent>[2];
    await recordEvent("page.viewed", {}, db);
    expect(values).toHaveBeenCalledWith({
      name: "page.viewed",
      userId: null,
      sessionId: null,
      props: {},
    });
  });

  it("never throws when the DB write fails", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const db = fakeDb(() => Promise.reject(new Error("db down")));
    await expect(recordEvent("user.signed_up", { userId: "u1" }, db)).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/api exec vitest run src/telemetry/record-event.test.ts`
Expected: FAIL — cannot find module `./record-event`.

- [ ] **Step 3: Implement the helper**

Create `apps/api/src/telemetry/record-event.ts`:

```ts
import { db as defaultDb, type DB } from "../db";
import { events } from "../db/schema";
import type { EventName } from "./events";

export interface RecordEventArgs {
  userId?: string | null;
  sessionId?: string | null;
  props?: Record<string, unknown>;
}

/**
 * Fire-and-forget telemetry write. NEVER throws into the caller's request
 * path: a failed/absent events table must not break signup or any user flow.
 */
export async function recordEvent(
  name: EventName,
  args: RecordEventArgs = {},
  database: DB = defaultDb,
): Promise<void> {
  try {
    await database.insert(events).values({
      name,
      userId: args.userId ?? null,
      sessionId: args.sessionId ?? null,
      props: args.props ?? {},
    });
  } catch (err) {
    console.error("[telemetry] recordEvent failed:", name, err);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/api exec vitest run src/telemetry/record-event.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/telemetry/record-event.ts apps/api/src/telemetry/record-event.test.ts
git commit -m "feat(api): non-blocking recordEvent helper"
```

---

## Task 5: Wire Better Auth lifecycle → auth events + expose `role`

**Files:**
- Modify: `apps/api/src/auth.ts`
- Test: `apps/api/src/auth-events.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/src/auth-events.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "./app";
import { db } from "./db";
import { events, user } from "./db/schema";

const email = `evt_${Date.now()}@example.com`;

afterAll(async () => {
  const rows = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  for (const r of rows) await db.delete(user).where(eq(user.id, r.id));
});

describe("auth lifecycle telemetry", () => {
  it("emits user.signed_up and user.signed_in on registration", async () => {
    const res = await app.request("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Evt", email, password: "password-123" }),
    });
    expect(res.status).toBeLessThan(400);

    const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
    expect(u).toBeTruthy();

    const evts = await db.select().from(events).where(eq(events.userId, u!.id));
    const names = evts.map((e) => e.name);
    expect(names).toContain("user.signed_up");
    expect(names).toContain("user.signed_in");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/api exec vitest run src/auth-events.test.ts`
Expected: FAIL — no `user.signed_up` event recorded.

- [ ] **Step 3: Add `additionalFields` + `databaseHooks` to Better Auth**

In `apps/api/src/auth.ts`, add the import:

```ts
import { recordEvent } from "./telemetry/record-event";
```

Add these two top-level options to the `betterAuth({ ... })` config object (place after `emailAndPassword: { enabled: true },`):

```ts
  user: {
    additionalFields: {
      // Surfaced on session.user so /me and the web admin guard can read it.
      // input:false → clients can't self-assign a role at sign-up.
      role: { type: "string", required: false, defaultValue: "user", input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          await recordEvent("user.signed_up", { userId: createdUser.id });
        },
      },
    },
    session: {
      create: {
        after: async (createdSession) => {
          await recordEvent("user.signed_in", {
            userId: createdSession.userId,
            sessionId: createdSession.id,
          });
        },
      },
    },
  },
```

> Note: sign-up also creates a session, so registration legitimately emits both
> `user.signed_up` and `user.signed_in` (a sign-up is also a session start).
> The funnel uses first-occurrence-per-user and DAU counts distinct users, so
> this double-emit does not skew metrics.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/api exec vitest run src/auth-events.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full API suite (no regressions)**

Run: `pnpm --filter @turingcare/api test`
Expected: all PASS (existing `app.test.ts` still green).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth.ts apps/api/src/auth-events.test.ts
git commit -m "feat(api): emit user.signed_up/signed_in + expose user.role on session"
```

---

## Task 6: `POST /api/events` ingest endpoint

**Files:**
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/events-route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/events-route.test.ts`:

```ts
import { desc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { app } from "./app";
import { db } from "./db";
import { events } from "./db/schema";

describe("POST /api/events", () => {
  it("rejects an event name not on the client allowlist", async () => {
    const res = await app.request("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "user.signed_in", props: {} }),
    });
    expect(res.status).toBe(400);
  });

  it("persists an anonymous page.viewed (userId null)", async () => {
    const path = `/test-${Date.now()}`;
    const res = await app.request("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "page.viewed", props: { path } }),
    });
    expect(res.status).toBe(202);

    const [row] = await db
      .select()
      .from(events)
      .where(eq(events.name, "page.viewed"))
      .orderBy(desc(events.createdAt))
      .limit(1);
    expect(row?.props).toMatchObject({ path });
    expect(row?.userId).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/api exec vitest run src/events-route.test.ts`
Expected: FAIL — route returns 404.

- [ ] **Step 3: Add the route to `app.ts`**

In `apps/api/src/app.ts`, add imports:

```ts
import { eventIngestSchema } from "./telemetry/events";
import { recordEvent } from "./telemetry/record-event";
```

Add this `.post` into the existing chain, immediately before the `.on(["POST", "GET"], "/api/auth/*", ...)` line:

```ts
  .post("/api/events", zValidator("json", eventIngestSchema), async (c) => {
    const { name, props } = c.req.valid("json");
    // Identity is resolved server-side from the auth cookie — never trusted
    // from the client. Anonymous (pre-auth, e.g. landing) is allowed.
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    await recordEvent(name, {
      userId: session?.user.id ?? null,
      sessionId: session?.session.id ?? null,
      props,
    });
    return c.json({ ok: true } as const, 202);
  })
```

> The existing app-wide `globalRateLimit()` (300/60s/IP, skips only `/health`
> and `/api/auth/*`) already covers `/api/events` — no extra limiter needed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/api exec vitest run src/events-route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full API suite**

Run: `pnpm --filter @turingcare/api test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/events-route.test.ts
git commit -m "feat(api): POST /api/events ingest endpoint"
```

---

## Task 7: `requireAdmin` middleware + `ADMIN_EMAILS` lazy promotion

**Files:**
- Create: `apps/api/src/middleware/require-admin.ts`
- Test: `apps/api/src/middleware/require-admin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/middleware/require-admin.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, describe, expect, it } from "vitest";
import { auth } from "../auth";
import { db } from "../db";
import { user } from "../db/schema";
import { requireAdmin } from "./require-admin";

// ADMIN_EMAILS is loaded from .env at parse time; this test asserts behavior
// for an email NOT in the list (normal user) and anonymous. The positive
// admin path is covered end-to-end in the admin-routes test (Task 8) where
// the test seeds the user's role directly.

const probe = new Hono().use("*", requireAdmin).get("/x", (c) => c.json({ ok: true }));
const email = `radm_${Date.now()}@example.com`;

afterAll(async () => {
  await db.delete(user).where(eq(user.email, email));
});

describe("requireAdmin", () => {
  it("returns 401 when there is no session", async () => {
    const res = await probe.request("/x");
    expect(res.status).toBe(401);
  });

  it("returns 403 for an authenticated non-admin", async () => {
    await auth.api.signUpEmail({
      body: { name: "RA", email, password: "password-123" },
    });
    const signIn = await auth.api.signInEmail({
      body: { email, password: "password-123" },
      asResponse: true,
    });
    const cookie = signIn.headers.get("set-cookie") ?? "";
    const res = await probe.request("/x", { headers: { cookie } });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/api exec vitest run src/middleware/require-admin.test.ts`
Expected: FAIL — cannot find module `./require-admin`.

- [ ] **Step 3: Implement the middleware**

Create `apps/api/src/middleware/require-admin.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/api exec vitest run src/middleware/require-admin.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/require-admin.ts apps/api/src/middleware/require-admin.test.ts
git commit -m "feat(api): requireAdmin middleware + ADMIN_EMAILS lazy promotion"
```

---

## Task 8: Admin metrics + activity routes

**Files:**
- Create: `apps/api/src/routes/admin.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/admin.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/routes/admin.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { app } from "../app";
import { auth } from "../auth";
import { db } from "../db";
import { user } from "../db/schema";

const email = `adm_${Date.now()}@example.com`;

afterAll(async () => {
  await db.delete(user).where(eq(user.email, email));
});

describe("/api/admin", () => {
  it("returns 401 when anonymous", async () => {
    const res = await app.request("/api/admin/metrics");
    expect(res.status).toBe(401);
  });

  it("returns 200 with metrics for an admin (role seeded)", async () => {
    await auth.api.signUpEmail({ body: { name: "Adm", email, password: "password-123" } });
    await db.update(user).set({ role: "admin" }).where(eq(user.email, email));
    const signIn = await auth.api.signInEmail({
      body: { email, password: "password-123" },
      asResponse: true,
    });
    const cookie = signIn.headers.get("set-cookie") ?? "";

    const res = await app.request("/api/admin/metrics?days=30", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("kpis");
    expect(body).toHaveProperty("signups");
    expect(body).toHaveProperty("active");
    expect(body).toHaveProperty("eventVolume");
    expect(body).toHaveProperty("funnel");

    const act = await app.request("/api/admin/activity", { headers: { cookie } });
    expect(act.status).toBe(200);
    expect(Array.isArray((await act.json()).items)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/api exec vitest run src/routes/admin.test.ts`
Expected: FAIL — `/api/admin/metrics` returns 404.

- [ ] **Step 3: Implement the admin sub-app**

Create `apps/api/src/routes/admin.ts`:

```ts
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { type AdminVars, requireAdmin } from "../middleware/require-admin";

function rangeDays(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 365 ? Math.floor(n) : 30;
}

export const adminApp = new Hono<{ Variables: AdminVars }>()
  .use("*", requireAdmin)
  .get("/metrics", async (c) => {
    const days = rangeDays(c.req.query("days"));
    const since = sql`now() - (${days} || ' days')::interval`;

    const [{ totalUsers }] = await db.execute<{ totalUsers: number }>(
      sql`select count(*)::int as "totalUsers" from "user"`,
    );
    const [{ newUsers }] = await db.execute<{ newUsers: number }>(
      sql`select count(*)::int as "newUsers" from "user" where created_at >= ${since}`,
    );
    const [{ dau }] = await db.execute<{ dau: number }>(
      sql`select count(distinct user_id)::int as dau from events
          where user_id is not null and created_at >= now() - interval '1 day'`,
    );
    const [{ wau }] = await db.execute<{ wau: number }>(
      sql`select count(distinct user_id)::int as wau from events
          where user_id is not null and created_at >= now() - interval '7 days'`,
    );
    const [{ mau }] = await db.execute<{ mau: number }>(
      sql`select count(distinct user_id)::int as mau from events
          where user_id is not null and created_at >= now() - interval '30 days'`,
    );
    const [{ eventCount }] = await db.execute<{ eventCount: number }>(
      sql`select count(*)::int as "eventCount" from events where created_at >= ${since}`,
    );

    const signups = await db.execute<{ day: string; count: number }>(
      sql`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
                 count(*)::int as count
          from "user" where created_at >= ${since}
          group by 1 order by 1`,
    );
    const active = await db.execute<{ day: string; count: number }>(
      sql`select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day,
                 count(distinct user_id)::int as count
          from events where user_id is not null and created_at >= ${since}
          group by 1 order by 1`,
    );
    const eventVolume = await db.execute<{ name: string; count: number }>(
      sql`select name, count(*)::int as count
          from events where created_at >= ${since}
          group by 1 order by 2 desc`,
    );

    const funnelRow = async (eventName: string) => {
      const [r] = await db.execute<{ n: number }>(
        sql`select count(distinct user_id)::int as n from events
            where user_id is not null and name = ${eventName}`,
      );
      return r.n;
    };
    const funnel = [
      { step: "signup", users: totalUsers },
      { step: "first_dog", users: await funnelRow("dog.created") },
      { step: "first_journal", users: await funnelRow("journal.entry_created") },
      { step: "first_brief", users: await funnelRow("brief.generated") },
    ];

    const mauSafe = mau || 1;
    return c.json({
      rangeDays: days,
      kpis: {
        totalUsers,
        newUsers,
        dau,
        wau,
        mau,
        stickiness: Math.round((dau / mauSafe) * 100) / 100,
        eventCount,
      },
      signups: [...signups],
      active: [...active],
      eventVolume: [...eventVolume],
      funnel,
    } as const);
  })
  .get("/activity", async (c) => {
    const items = await db.execute<{
      id: string;
      name: string;
      userId: string | null;
      createdAt: string;
      props: unknown;
    }>(
      sql`select id, name, user_id as "userId",
                 to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') as "createdAt",
                 props
          from events order by created_at desc limit 100`,
    );
    return c.json({ items: [...items] } as const);
  });
```

> `db.execute` returns a driver result iterable; spreading (`[...rows]`) yields
> plain row objects. `count(distinct user_id)` over `events` for the funnel's
> last three steps is correct today (zero until those features ship) and fills
> in automatically when dog/journal/brief endpoints call `recordEvent`.

In `apps/api/src/app.ts` add the import:

```ts
import { adminApp } from "./routes/admin";
```

Mount it into the chain (immediately after the `.post("/api/events", ...)` block, before the auth handler line):

```ts
  .route("/api/admin", adminApp)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/api exec vitest run src/routes/admin.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full API suite + typecheck**

Run: `pnpm --filter @turingcare/api test && pnpm --filter @turingcare/api typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin.ts apps/api/src/app.ts apps/api/src/routes/admin.test.ts
git commit -m "feat(api): /api/admin metrics + activity routes"
```

---

## Task 9: Retention purge — pure logic + CLI + scheduled workflow

**Files:**
- Create: `apps/api/src/telemetry/retention.ts`
- Create: `apps/api/src/telemetry/retention-cli.ts`
- Create: `.github/workflows/retention.yml`
- Test: `apps/api/src/telemetry/retention.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/telemetry/retention.test.ts`:

```ts
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { events } from "../db/schema";
import { purgeOldEvents, retentionCutoff } from "./retention";

const marker = `retention_test_${Date.now()}`;

afterAll(async () => {
  await db.delete(events).where(eq(events.name, marker));
});

describe("retention", () => {
  it("retentionCutoff subtracts the right number of days", () => {
    const now = new Date("2026-05-17T00:00:00.000Z");
    expect(retentionCutoff(now, 180).toISOString()).toBe("2025-11-18T00:00:00.000Z");
  });

  it("purgeOldEvents deletes only rows older than the cutoff", async () => {
    const old = new Date(Date.now() - 200 * 86_400_000);
    const recent = new Date();
    await db.insert(events).values([
      { name: marker, props: {}, createdAt: old },
      { name: marker, props: {}, createdAt: recent },
    ]);

    const deleted = await purgeOldEvents(db, 180);
    expect(deleted).toBeGreaterThanOrEqual(1);

    const left = await db.select().from(events).where(eq(events.name, marker));
    expect(left).toHaveLength(1);
    expect(left[0]!.createdAt.getTime()).toBeGreaterThan(old.getTime());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/api exec vitest run src/telemetry/retention.test.ts`
Expected: FAIL — cannot find module `./retention`.

- [ ] **Step 3: Implement retention logic + CLI**

Create `apps/api/src/telemetry/retention.ts`:

```ts
import { lt } from "drizzle-orm";
import { type DB } from "../db";
import { events } from "../db/schema";

export function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * 86_400_000);
}

/** Deletes events older than `retentionDays`. Returns the row count removed. */
export async function purgeOldEvents(
  database: DB,
  retentionDays: number,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = retentionCutoff(now, retentionDays);
  const removed = await database
    .delete(events)
    .where(lt(events.createdAt, cutoff))
    .returning({ id: events.id });
  return removed.length;
}
```

Create `apps/api/src/telemetry/retention-cli.ts`:

```ts
import { db, pool } from "../db";
import { env } from "../env";
import { purgeOldEvents } from "./retention";

// Runnable entrypoint for the scheduled GitHub Actions retention job.
async function main() {
  const removed = await purgeOldEvents(db, env.EVENT_RETENTION_DAYS);
  console.log(`[retention] deleted ${removed} events older than ${env.EVENT_RETENTION_DAYS}d`);
  await pool.end();
}

main().catch((err) => {
  console.error("[retention] failed:", err);
  process.exit(1);
});
```

Add a script to `apps/api/package.json` `"scripts"` (after `"db:push"`):

```json
    "telemetry:purge": "tsx src/telemetry/retention-cli.ts"
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/api exec vitest run src/telemetry/retention.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the scheduled workflow**

Create `.github/workflows/retention.yml`:

```yaml
name: Telemetry retention

# Daily purge of events older than EVENT_RETENTION_DAYS against prod Postgres.
on:
  schedule:
    - cron: "17 4 * * *" # 04:17 UTC daily
  workflow_dispatch: {}

jobs:
  purge:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      BETTER_AUTH_SECRET: ci-only-insecure-secret-0123456789abcdef
      BETTER_AUTH_URL: http://localhost:3001
      FRONTEND_URL: http://localhost:3000
      EVENT_RETENTION_DAYS: "180"
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @turingcare/api telemetry:purge
```

> Reuses the same `secrets.DATABASE_URL` pattern as the existing `deploy.yml`
> `migrate` job. A scheduled Action is reliable here; an in-process timer is
> not, because Fly `auto_stop_machines` lets the API scale to zero.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/telemetry/retention.ts apps/api/src/telemetry/retention-cli.ts apps/api/src/telemetry/retention.test.ts apps/api/package.json .github/workflows/retention.yml
git commit -m "feat(api): event retention purge (logic + CLI + scheduled workflow)"
```

---

## Task 10: Web — add Recharts + page-view tracking

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/lib/track.ts`
- Modify: `apps/web/src/main.tsx`
- Test: `apps/web/src/lib/track.test.tsx`

- [ ] **Step 1: Add Recharts**

Run: `pnpm --filter @turingcare/web add recharts`
Expected: `recharts` appears in `apps/web/package.json` dependencies; lockfile updates.

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/lib/track.test.tsx`:

```tsx
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PageViewTracker } from "./track";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it("posts a page.viewed event for the current path", async () => {
  render(
    <MemoryRouter initialEntries={["/app"]}>
      <PageViewTracker />
      <Routes>
        <Route path="/app" element={<div>app</div>} />
      </Routes>
    </MemoryRouter>,
  );
  const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/api/events"),
    expect.objectContaining({ method: "POST" }),
  );
  const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
  expect(body).toEqual({ name: "page.viewed", props: { path: "/app" } });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/lib/track.test.tsx`
Expected: FAIL — cannot find module `./track`.

- [ ] **Step 4: Implement `track.ts`**

Create `apps/web/src/lib/track.ts`:

```ts
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const base = import.meta.env.VITE_API_URL || "";

/** Fire-and-forget telemetry. Network/HTTP failures are swallowed. */
export function track(name: string, props: Record<string, unknown> = {}): void {
  void fetch(`${base}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name, props }),
  }).catch(() => {});
}

/** Mount once inside the Router: emits page.viewed on every route change
 * (including landing/pre-auth, where the server records userId = null). */
export function PageViewTracker(): null {
  const { pathname } = useLocation();
  useEffect(() => {
    track("page.viewed", { path: pathname });
  }, [pathname]);
  return null;
}
```

- [ ] **Step 5: Mount the tracker in `main.tsx`**

In `apps/web/src/main.tsx`, add the import:

```ts
import { PageViewTracker } from "@/lib/track";
```

Add `<PageViewTracker />` as the first child inside `<BrowserRouter>`, before `<Routes>`:

```tsx
        <BrowserRouter>
          <PageViewTracker />
          <Routes>
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/lib/track.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/lib/track.ts apps/web/src/lib/track.test.tsx apps/web/src/main.tsx
git commit -m "feat(web): recharts dep + page-view tracking"
```

---

## Task 11: Web — admin guard + metrics query hooks

**Files:**
- Create: `apps/web/src/routes/admin/require-admin.tsx`
- Create: `apps/web/src/routes/admin/use-metrics.ts`
- Test: `apps/web/src/routes/admin/require-admin.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/admin/require-admin.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RequireAdmin } from "./require-admin";

function mockMe(role: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      role === null
        ? new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })
        : new Response(JSON.stringify({ user: { id: "u1", email: "a@b.c", role } }), {
            status: 200,
          }),
    ),
  );
}
afterEach(() => vi.unstubAllGlobals());

function setup() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <div>secret dashboard</div>
              </RequireAdmin>
            }
          />
          <Route path="/app" element={<div>app home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("renders children for an admin", async () => {
  mockMe("admin");
  setup();
  await waitFor(() => expect(screen.getByText("secret dashboard")).toBeInTheDocument());
});

it("redirects a non-admin to /app", async () => {
  mockMe("user");
  setup();
  await waitFor(() => expect(screen.getByText("app home")).toBeInTheDocument());
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/admin/require-admin.test.tsx`
Expected: FAIL — cannot find module `./require-admin`.

- [ ] **Step 3: Implement the guard and query hook**

Create `apps/web/src/routes/admin/require-admin.tsx`:

```tsx
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["me", "admin"],
    retry: false,
    queryFn: async () => {
      const res = await api.me.$get();
      if (!res.ok) throw new Error("unauthorized");
      return (await res.json()) as { user: { role?: string } };
    },
  });

  if (isPending) return <p className="p-8">Loading…</p>;
  if (isError || data?.user?.role !== "admin") return <Navigate to="/app" replace />;
  return <>{children}</>;
}
```

Create `apps/web/src/routes/admin/use-metrics.ts`:

```ts
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export type Metrics = {
  rangeDays: number;
  kpis: {
    totalUsers: number;
    newUsers: number;
    dau: number;
    wau: number;
    mau: number;
    stickiness: number;
    eventCount: number;
  };
  signups: { day: string; count: number }[];
  active: { day: string; count: number }[];
  eventVolume: { name: string; count: number }[];
  funnel: { step: string; users: number }[];
};

export type Activity = {
  items: { id: string; name: string; userId: string | null; createdAt: string; props: unknown }[];
};

export function useMetrics(days: number) {
  return useQuery({
    queryKey: ["admin", "metrics", days],
    queryFn: async () => {
      const res = await api.api.admin.metrics.$get({ query: { days: String(days) } });
      if (!res.ok) throw new Error("metrics failed");
      return (await res.json()) as Metrics;
    },
  });
}

export function useActivity() {
  return useQuery({
    queryKey: ["admin", "activity"],
    queryFn: async () => {
      const res = await api.api.admin.activity.$get();
      if (!res.ok) throw new Error("activity failed");
      return (await res.json()) as Activity;
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/admin/require-admin.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @turingcare/web typecheck`
Expected: no errors (confirms the `hc` client resolves `api.api.admin.metrics.$get`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/admin/require-admin.tsx apps/web/src/routes/admin/use-metrics.ts apps/web/src/routes/admin/require-admin.test.tsx
git commit -m "feat(web): admin route guard + metrics query hooks"
```

---

## Task 12: Web — dashboard panels (Layout A)

**Files:**
- Create: `apps/web/src/routes/admin/panels/kpi-strip.tsx`
- Create: `apps/web/src/routes/admin/panels/growth.tsx`
- Create: `apps/web/src/routes/admin/panels/active-usage.tsx`
- Create: `apps/web/src/routes/admin/panels/funnel.tsx`
- Create: `apps/web/src/routes/admin/panels/activity-feed.tsx`
- Test: `apps/web/src/routes/admin/panels/panels.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/admin/panels/panels.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { Activity, Metrics } from "../use-metrics";
import { ActivityFeed } from "./activity-feed";
import { KpiStrip } from "./kpi-strip";

const metrics: Metrics = {
  rangeDays: 30,
  kpis: { totalUsers: 128, newUsers: 14, dau: 9, wau: 41, mau: 60, stickiness: 0.15, eventCount: 2100 },
  signups: [{ day: "2026-05-01", count: 3 }],
  active: [{ day: "2026-05-01", count: 5 }],
  eventVolume: [{ name: "page.viewed", count: 1900 }],
  funnel: [{ step: "signup", users: 128 }],
};

it("KpiStrip shows the headline numbers", () => {
  render(<KpiStrip kpis={metrics.kpis} />);
  expect(screen.getByText("128")).toBeInTheDocument();
  expect(screen.getByText(/total users/i)).toBeInTheDocument();
});

it("ActivityFeed lists events", () => {
  const activity: Activity = {
    items: [
      { id: "1", name: "user.signed_in", userId: "abcdef123", createdAt: "2026-05-17T10:00:00+00", props: {} },
    ],
  };
  render(<ActivityFeed activity={activity} />);
  expect(screen.getByText("user.signed_in")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/admin/panels/panels.test.tsx`
Expected: FAIL — cannot find module `./kpi-strip`.

- [ ] **Step 3: Implement the five panels**

Create `apps/web/src/routes/admin/panels/kpi-strip.tsx`:

```tsx
import type { Metrics } from "../use-metrics";

const CARDS: { key: keyof Metrics["kpis"]; label: string }[] = [
  { key: "totalUsers", label: "Total users" },
  { key: "newUsers", label: "New (range)" },
  { key: "wau", label: "WAU" },
  { key: "stickiness", label: "DAU/MAU" },
  { key: "eventCount", label: "Events (range)" },
];

export function KpiStrip({ kpis }: { kpis: Metrics["kpis"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {CARDS.map((c) => (
        <div key={c.key} className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">{c.label}</div>
          <div className="mt-1 text-2xl font-bold">{kpis[c.key]}</div>
        </div>
      ))}
    </div>
  );
}
```

Create `apps/web/src/routes/admin/panels/growth.tsx`:

```tsx
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Metrics } from "../use-metrics";

export function Growth({ signups }: { signups: Metrics["signups"] }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
        Signups over time
      </h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={signups}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} />
          <Tooltip />
          <Bar dataKey="count" fill="#38bdf8" />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
```

Create `apps/web/src/routes/admin/panels/active-usage.tsx`:

```tsx
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Metrics } from "../use-metrics";

export function ActiveUsage({ active, kpis }: { active: Metrics["active"]; kpis: Metrics["kpis"] }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-1 text-sm font-semibold uppercase text-muted-foreground">Active users</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        DAU {kpis.dau} · WAU {kpis.wau} · MAU {kpis.mau}
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={active}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} />
          <Tooltip />
          <Line type="monotone" dataKey="count" stroke="#b45309" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
```

Create `apps/web/src/routes/admin/panels/funnel.tsx`:

```tsx
import type { Metrics } from "../use-metrics";

export function Funnel({ funnel }: { funnel: Metrics["funnel"] }) {
  const top = funnel[0]?.users || 1;
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
        Activation funnel
      </h2>
      <div className="space-y-2">
        {funnel.map((f) => (
          <div key={f.step} className="flex items-center gap-3">
            <div className="w-32 text-sm">{f.step}</div>
            <div className="h-5 flex-1 rounded bg-muted">
              <div
                className="h-5 rounded bg-sky-500"
                style={{ width: `${Math.max(2, (f.users / top) * 100)}%` }}
              />
            </div>
            <div className="w-12 text-right text-sm tabular-nums">{f.users}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

Create `apps/web/src/routes/admin/panels/activity-feed.tsx`:

```tsx
import type { Activity } from "../use-metrics";

export function ActivityFeed({ activity }: { activity: Activity }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
        Live activity
      </h2>
      <ul className="divide-y text-sm">
        {activity.items.map((e) => (
          <li key={e.id} className="flex items-center justify-between py-1.5">
            <span className="font-mono text-xs text-muted-foreground">
              {e.userId ? e.userId.slice(0, 8) : "anon"}
            </span>
            <span>{e.name}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(e.createdAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/admin/panels/panels.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes/admin/panels/
git commit -m "feat(web): admin dashboard panels (KPI, growth, active, funnel, activity)"
```

---

## Task 13: Web — dashboard page + route wiring

**Files:**
- Create: `apps/web/src/routes/admin/index.tsx`
- Modify: `apps/web/src/main.tsx`
- Test: `apps/web/src/routes/admin/index.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/routes/admin/index.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminDashboard } from "./index";

const metrics = {
  rangeDays: 30,
  kpis: { totalUsers: 7, newUsers: 2, dau: 1, wau: 3, mau: 5, stickiness: 0.2, eventCount: 12 },
  signups: [{ day: "2026-05-01", count: 2 }],
  active: [{ day: "2026-05-01", count: 1 }],
  eventVolume: [{ name: "page.viewed", count: 12 }],
  funnel: [{ step: "signup", users: 7 }],
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(String(url).includes("/activity") ? { items: [] } : metrics),
          { status: 200 },
        ),
      ),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

it("renders the dashboard with KPI numbers", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AdminDashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(screen.getByText("7")).toBeInTheDocument());
  expect(screen.getByText(/signups over time/i)).toBeInTheDocument();
  expect(screen.getByText(/activation funnel/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/admin/index.test.tsx`
Expected: FAIL — cannot find module `./index`.

- [ ] **Step 3: Implement the dashboard shell (Layout A)**

Create `apps/web/src/routes/admin/index.tsx`:

```tsx
import { useState } from "react";
import { ActiveUsage } from "./panels/active-usage";
import { ActivityFeed } from "./panels/activity-feed";
import { Funnel } from "./panels/funnel";
import { Growth } from "./panels/growth";
import { KpiStrip } from "./panels/kpi-strip";
import { useActivity, useMetrics } from "./use-metrics";

const RANGES = [7, 30, 90] as const;

export function AdminDashboard() {
  const [days, setDays] = useState<number>(30);
  const metrics = useMetrics(days);
  const activity = useActivity();

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">TuringCare · Admin</h1>
        <select
          className="rounded border bg-background px-2 py-1 text-sm"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {RANGES.map((r) => (
            <option key={r} value={r}>
              Last {r}d
            </option>
          ))}
        </select>
      </header>

      {metrics.isPending ? (
        <p className="p-8">Loading metrics…</p>
      ) : metrics.isError || !metrics.data ? (
        <p className="p-8 text-destructive">Failed to load metrics.</p>
      ) : (
        <>
          <KpiStrip kpis={metrics.data.kpis} />
          <Growth signups={metrics.data.signups} />
          <div className="grid gap-4 md:grid-cols-2">
            <ActiveUsage active={metrics.data.active} kpis={metrics.data.kpis} />
            <Funnel funnel={metrics.data.funnel} />
          </div>
          <ActivityFeed activity={activity.data ?? { items: [] }} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire the route in `main.tsx`**

In `apps/web/src/main.tsx` add imports:

```ts
import { AdminDashboard } from "@/routes/admin";
import { RequireAdmin } from "@/routes/admin/require-admin";
```

Add this `<Route>` inside `<Routes>` (after the `/app` route):

```tsx
            <Route
              path="/admin"
              element={
                <RequireAdmin>
                  <AdminDashboard />
                </RequireAdmin>
              }
            />
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @turingcare/web exec vitest run src/routes/admin/index.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full web suite + typecheck**

Run: `pnpm --filter @turingcare/web test && pnpm --filter @turingcare/web typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/admin/index.tsx apps/web/src/routes/admin/index.test.tsx apps/web/src/main.tsx
git commit -m "feat(web): /admin dashboard page + route"
```

---

## Task 14: Full gate + PROJECT-LOG entry

**Files:**
- Modify: `docs/PROJECT-LOG.md`

- [ ] **Step 1: Run the entire gate (mirrors CI)**

Run:
```bash
pnpm biome check . && pnpm -r exec tsc --noEmit && pnpm -r test && pnpm -r build
```
Expected: lint clean, no type errors, all tests pass, both apps build. Fix any failure before continuing (do not proceed with a red gate).

- [ ] **Step 2: Add the PROJECT-LOG entry**

Append to `docs/PROJECT-LOG.md` (newest at the bottom):

```markdown
## 2026-05-17 — Admin portal & usage telemetry — SHIPPED
Self-hosted first-party telemetry: `events` table (migration 0002) + `user.role`
enum; non-blocking `recordEvent` wired into Better Auth (`user.signed_up`,
`user.signed_in`); rate-limited `POST /api/events` (scalar-only, size-capped,
identity resolved server-side) + web `page.viewed` tracking on every route
(incl. pre-auth). `requireAdmin` (role + `ADMIN_EMAILS` self-healing bootstrap)
gating `GET /api/admin/metrics` + `/activity`. Single-page `/admin` Recharts
dashboard (Layout A): KPI strip, signups, active-usage, activation funnel, live
activity. 180-day retention via scheduled GitHub Actions workflow.
- Spec/plan: `specs/2026-05-17-admin-telemetry-design.md`, `plans/2026-05-17-admin-telemetry.md`
- Commits: this cycle (see `git log`).
```

- [ ] **Step 3: Commit**

```bash
git add docs/PROJECT-LOG.md
git commit -m "docs: PROJECT-LOG entry for admin portal & telemetry"
```

- [ ] **Step 4: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to open the PR (per the established worktree/PR workflow — no direct-to-main).

---

## Self-Review

**Spec coverage:**
- §2.1 events table → Task 1 ✓ · §2.2 user.role → Task 1 ✓ · §2.3 recordEvent + auth wiring → Tasks 4, 5 ✓ · §2.3 client track + POST /api/events → Tasks 6, 10 ✓ · §2.4 requireAdmin + ADMIN_EMAILS lazy promotion → Task 7 ✓ · §2.4 role on /me / web guard → Tasks 5, 11 ✓ · §2.5 retention → Task 9 ✓ · §3 dashboard Layout A + 4 panels + KPI + range → Tasks 12, 13 ✓ · §3 metrics/activity API → Task 8 ✓ · §4 reliability (non-blocking, 401/403, allowlist, capped) → Tasks 4, 6, 7, 8 ✓ · §5 testing (unit/integration/component) → every task is TDD ✓ · charting=Recharts → Tasks 10, 12 ✓ · landing/pre-auth page views → Task 10 ✓.
- No spec requirement is left without a task.

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to" — every code step contains complete code; every run step has an exact command and expected result.

**Type consistency:** `EventName` (events.ts) is consumed by `recordEvent` and the auth hooks. `Metrics`/`Activity` shapes returned by `routes/admin.ts` match the `use-metrics.ts` types and the panel props (`kpis`, `signups`, `active`, `eventVolume`, `funnel`, `items`). `AdminVars` defined in `require-admin.ts` is reused by `routes/admin.ts`. `recordEvent` third arg type (`DB`) is consistent across helper, tests, and retention. Web `api.api.admin.metrics.$get` path matches the `.route("/api/admin", adminApp)` mount with `/metrics` + `/activity`.
