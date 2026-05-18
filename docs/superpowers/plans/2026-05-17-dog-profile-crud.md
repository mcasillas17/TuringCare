# Dog Profile CRUD (sub-project C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authenticated, owner-scoped, fully-localized CRUD over the existing `dogs`, `behavior_concerns`, `training_goals` tables — multi-dog list/create/view/edit/delete plus per-dog concern & goal sub-lists.

**Architecture:** Add Spanish/zod schemas to `@turingcare/shared`; an isolated Hono sub-router `apps/api/src/routes/dogs.ts` (auth middleware + owner-scoped Drizzle queries) mounted via `.route("/api/dogs", dogsApp)` so `AppType` keeps inferring for the `hc` client; TanStack Query hooks + React-Router pages in `apps/web` replacing the `/app` JSON placeholder; every string via `t()` with `en`/`es` parity.

**Tech Stack:** Hono + Drizzle + Better Auth (api), React 19 + React Router v7 + TanStack Query + react-hook-form + zod (web), Vitest. **No new dependencies** (`react-hook-form`/`@hookform/resolvers` already in `apps/web/package.json`).

**Spec:** `docs/superpowers/specs/2026-05-17-dog-profile-crud-design.md`

**Conventions:** Worktree `worktree-dog-profile-crud`; ships as ONE PR via superpowers:finishing-a-development-branch (Pull Request option) — do NOT push to `main`, do NOT commit to `main`. gpg-unsigned commits ending with:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
Commands: API/shared tests need env — prefix `set -a && . ./.env && set +a && <cmd>`. `pnpm lint`/`pnpm -r ...` from repo root. Web cmds: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web <cmd>`. No `apps/api` infra (fly.toml/Dockerfile) change. No DB migration (tables already exist). No `package.json`/`pnpm-lock.yaml` change.

> **DB note for tests:** api tests run against the real Postgres in `.env` (same as the existing rate-limit test). The Task 2 helper creates a unique throwaway user per test and deletes it afterward (FK `onDelete: cascade` cleans dogs/concerns/goals/session/account). Every authed test request carries a unique `x-forwarded-for` so the global rate-limiter never cross-talks between tests.

---

## File Structure

```
packages/shared/src/dog.ts                 MODIFY  + behaviorConcernSchema, trainingGoalSchema, types
packages/shared/src/dog.test.ts            MODIFY  + tests for the two new schemas
apps/api/src/routes/dogs.ts                CREATE  Hono sub-router: auth mw + 9 owner-scoped endpoints
apps/api/src/app.ts                        MODIFY  mount .route("/api/dogs", dogsApp)
apps/api/src/test-helpers.ts               CREATE  createTestUser() → authed cookie + cleanup
apps/api/src/routes/dogs.test.ts           CREATE  endpoint + owner-isolation tests
apps/web/src/i18n/en.ts                    MODIFY  + dogs.* section
apps/web/src/i18n/es.ts                    MODIFY  + dogs.* section (Spanish)
apps/web/src/lib/dogs.ts                   CREATE  TanStack Query hooks (list/get/create/update/delete/concern/goal)
apps/web/src/routes/dogs-list.tsx          CREATE  /app — list + empty state + Add
apps/web/src/routes/dog-form.tsx           CREATE  create & edit core-profile form (react-hook-form + zod)
apps/web/src/routes/dog-detail.tsx         CREATE  detail: summary + concerns/goals sub-lists + delete-confirm
apps/web/src/routes/dogs.test.tsx          CREATE  list (empty/populated) + create-flow render tests
apps/web/src/main.tsx                      MODIFY  mount the 4 routes under RequireAuth (drop JSON dump)
docs/PROJECT-LOG.md                        MODIFY  shipped entry
```

---

## Task 1: Shared schemas for concerns & goals

**Files:** Modify `packages/shared/src/dog.ts`, `packages/shared/src/dog.test.ts`

- [ ] **Step 1: Add failing tests** — append to `packages/shared/src/dog.test.ts`:

```ts
import { behaviorConcernSchema, trainingGoalSchema } from "./dog";

describe("behaviorConcernSchema", () => {
  it("accepts a valid concern", () => {
    expect(
      behaviorConcernSchema.safeParse({ concern: "Leash reactivity", severity: "moderate" })
        .success,
    ).toBe(true);
  });
  it("rejects an empty concern", () => {
    expect(behaviorConcernSchema.safeParse({ concern: "", severity: "mild" }).success).toBe(false);
  });
  it("rejects a bad severity", () => {
    expect(
      behaviorConcernSchema.safeParse({ concern: "Barking", severity: "extreme" }).success,
    ).toBe(false);
  });
});

describe("trainingGoalSchema", () => {
  it("accepts a valid goal", () => {
    expect(trainingGoalSchema.safeParse({ goal: "Calm greetings" }).success).toBe(true);
  });
  it("rejects an empty goal", () => {
    expect(trainingGoalSchema.safeParse({ goal: "" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run → RED**

`set -a && . ./.env && set +a && pnpm --filter @turingcare/shared test`
Expected: FAIL — `behaviorConcernSchema`/`trainingGoalSchema` not exported.

- [ ] **Step 3: Implement** — append to `packages/shared/src/dog.ts`:

```ts
export const concernSeverity = z.enum(["mild", "moderate", "severe"]);

export const behaviorConcernSchema = z.object({
  concern: z.string().min(1, "Concern is required"),
  severity: concernSeverity,
});
export type BehaviorConcernInput = z.infer<typeof behaviorConcernSchema>;

export const trainingGoalSchema = z.object({
  goal: z.string().min(1, "Goal is required"),
});
export type TrainingGoalInput = z.infer<typeof trainingGoalSchema>;
```
(`packages/shared/src/index.ts` already does `export * from "./dog";` — no change there.)

- [ ] **Step 4: Run → GREEN**

`set -a && . ./.env && set +a && pnpm --filter @turingcare/shared test` → all pass.
`set -a && . ./.env && set +a && pnpm --filter @turingcare/shared exec tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/dog.ts packages/shared/src/dog.test.ts
git -c commit.gpgsign=false commit -m "feat(shared): behaviorConcern & trainingGoal schemas" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: API test helper (authenticated session)

**Files:** Create `apps/api/src/test-helpers.ts`

The dog endpoints are owner-scoped, so tests need a real Better-Auth session. This helper signs a unique user up through the in-memory app, captures the session cookie, and provides cleanup.

- [ ] **Step 1: Create `apps/api/src/test-helpers.ts`**

```ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { app } from "./app";
import { db } from "./db";
import { user } from "./db/schema";

export type TestUser = {
  userId: string;
  /** Headers to spread into app.request() for authed calls (cookie + unique IP). */
  authHeaders: Record<string, string>;
  cleanup: () => Promise<void>;
};

/**
 * Sign a throwaway user up via Better Auth and return its session cookie.
 * Each user gets a unique x-forwarded-for so the global rate-limiter never
 * cross-talks between tests. cleanup() deletes the user (cascade removes
 * dogs/concerns/goals/session/account).
 */
export async function createTestUser(): Promise<TestUser> {
  const id = randomUUID();
  const ip = `198.51.100.${Math.floor(Math.random() * 254) + 1}`;
  const email = `test-${id}@example.com`;
  const baseHeaders = { "Content-Type": "application/json", "x-forwarded-for": ip };

  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({ name: "Test User", email, password: "test-password-123" }),
  });
  if (!res.ok) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);

  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("no session cookie returned from sign-up");
  // "name=value; Path=/; ..." → keep just "name=value" for the Cookie header.
  const cookie = setCookie.split(";")[0];

  const me = await app.request("/me", { headers: { ...baseHeaders, cookie } });
  if (!me.ok) throw new Error(`/me check failed: ${me.status}`);
  const { user: u } = (await me.json()) as { user: { id: string } };

  return {
    userId: u.id,
    authHeaders: { ...baseHeaders, cookie },
    cleanup: async () => {
      await db.delete(user).where(eq(user.id, u.id));
    },
  };
}
```

- [ ] **Step 2: Typecheck**

`set -a && . ./.env && set +a && pnpm --filter @turingcare/api exec tsc --noEmit` → 0 errors. (No standalone test — exercised by Task 3+.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/test-helpers.ts
git -c commit.gpgsign=false commit -m "test(api): authed test-user helper with cleanup" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Dogs router skeleton + list & create

**Files:** Create `apps/api/src/routes/dogs.ts`; Modify `apps/api/src/app.ts`; Create `apps/api/src/routes/dogs.test.ts`

- [ ] **Step 1: Write failing tests** — create `apps/api/src/routes/dogs.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { app } from "../app";
import { createTestUser, type TestUser } from "../test-helpers";

const validDog = {
  name: "Biscuit",
  size: "medium",
  sex: "female",
  source: "rescue",
  vaccineStage: "in_progress",
  spayedNeutered: true,
};

describe("dogs: list & create", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    while (users.length) await users.pop()!.cleanup();
  });

  it("GET /api/dogs requires auth", async () => {
    const res = await app.request("/api/dogs");
    expect(res.status).toBe(401);
  });

  it("creates and lists the caller's dogs", async () => {
    const u = await createTestUser();
    users.push(u);

    const empty = await app.request("/api/dogs", { headers: u.authHeaders });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ dogs: [] });

    const created = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    expect(created.status).toBe(201);
    const { dog } = (await created.json()) as { dog: { id: string; name: string } };
    expect(dog.name).toBe("Biscuit");

    const list = await app.request("/api/dogs", { headers: u.authHeaders });
    expect(((await list.json()) as { dogs: unknown[] }).dogs).toHaveLength(1);
  });

  it("rejects an invalid body with 400", async () => {
    const u = await createTestUser();
    users.push(u);
    const res = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("does not list another user's dogs", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    await app.request("/api/dogs", {
      method: "POST",
      headers: a.authHeaders,
      body: JSON.stringify(validDog),
    });
    const bList = await app.request("/api/dogs", { headers: b.authHeaders });
    expect(((await bList.json()) as { dogs: unknown[] }).dogs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → RED**

`set -a && . ./.env && set +a && pnpm --filter @turingcare/api test dogs`
Expected: FAIL — `/api/dogs` 404 (route not mounted).

- [ ] **Step 3: Create `apps/api/src/routes/dogs.ts`**

```ts
import { zValidator } from "@hono/zod-validator";
import { dogProfileSchema } from "@turingcare/shared";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { auth } from "../auth";
import { db } from "../db";
import { dogs } from "../db/schema";

type Vars = { userId: string };

const requireUser = createMiddleware<{ Variables: Vars }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "unauthorized" } as const, 401);
  c.set("userId", session.user.id);
  await next();
});

export const dogsApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const rows = await db
      .select()
      .from(dogs)
      .where(eq(dogs.ownerId, c.get("userId")))
      .orderBy(desc(dogs.createdAt));
    return c.json({ dogs: rows });
  })
  .post("/", zValidator("json", dogProfileSchema), async (c) => {
    const body = c.req.valid("json");
    const [dog] = await db
      .insert(dogs)
      .values({ ...body, ownerId: c.get("userId") })
      .returning();
    return c.json({ dog }, 201);
  });
```

- [ ] **Step 4: Mount it in `apps/api/src/app.ts`**

Add the import with the other imports:
```ts
import { dogsApp } from "./routes/dogs";
```
Add `.route("/api/dogs", dogsApp)` to the chained `app` immediately before `.on(["POST", "GET"], "/api/auth/*", ...)` so the chain (and `AppType` inference) stays intact:
```ts
  .route("/api/dogs", dogsApp)
  .on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
```
Change nothing else in `app.ts`.

- [ ] **Step 5: Run → GREEN**

`set -a && . ./.env && set +a && pnpm --filter @turingcare/api test dogs` → all pass.
`set -a && . ./.env && set +a && pnpm --filter @turingcare/api test` → existing app/rate-limit tests still pass.
`set -a && . ./.env && set +a && pnpm --filter @turingcare/api exec tsc --noEmit` → 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/dogs.ts apps/api/src/app.ts apps/api/src/routes/dogs.test.ts
git -c commit.gpgsign=false commit -m "feat(api): dogs router — list & create (owner-scoped)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Get-one (with concerns+goals), update, delete

**Files:** Modify `apps/api/src/routes/dogs.ts`, `apps/api/src/routes/dogs.test.ts`

- [ ] **Step 1: Append failing tests** to `apps/api/src/routes/dogs.test.ts`:

```ts
describe("dogs: get/update/delete", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    while (users.length) await users.pop()!.cleanup();
  });

  async function makeDog(u: TestUser) {
    const res = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    return ((await res.json()) as { dog: { id: string } }).dog;
  }

  it("GET /api/dogs/:id returns the dog with empty concerns & goals", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const res = await app.request(`/api/dogs/${dog.id}`, { headers: u.authHeaders });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      dog: { id: dog.id, name: "Biscuit" },
      concerns: [],
      goals: [],
    });
  });

  it("PUT updates the core profile", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const res = await app.request(`/api/dogs/${dog.id}`, {
      method: "PUT",
      headers: u.authHeaders,
      body: JSON.stringify({ ...validDog, name: "Biscuit II" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { dog: { name: string } }).dog.name).toBe("Biscuit II");
  });

  it("DELETE removes the dog", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const del = await app.request(`/api/dogs/${dog.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(del.status).toBe(200);
    const after = await app.request(`/api/dogs/${dog.id}`, { headers: u.authHeaders });
    expect(after.status).toBe(404);
  });

  it("owner isolation: another user gets 404 on get/put/delete", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    expect((await app.request(`/api/dogs/${dog.id}`, { headers: b.authHeaders })).status).toBe(404);
    expect(
      (
        await app.request(`/api/dogs/${dog.id}`, {
          method: "PUT",
          headers: b.authHeaders,
          body: JSON.stringify(validDog),
        })
      ).status,
    ).toBe(404);
    expect(
      (await app.request(`/api/dogs/${dog.id}`, { method: "DELETE", headers: b.authHeaders }))
        .status,
    ).toBe(404);
  });
});
```

- [ ] **Step 2: Run → RED**

`set -a && . ./.env && set +a && pnpm --filter @turingcare/api test dogs` → new tests FAIL (routes 404).

- [ ] **Step 3: Implement** — in `apps/api/src/routes/dogs.ts`: add imports and a shared owner-lookup, then chain the three routes after `.post("/", …)`.

Update the schema import line and add helper imports at top:
```ts
import { behaviorConcerns, dogs, trainingGoals } from "../db/schema";
```
(replace the existing `import { dogs } from "../db/schema";`).

Add this helper above `export const dogsApp`:
```ts
async function findOwnedDog(userId: string, dogId: string) {
  const [dog] = await db
    .select()
    .from(dogs)
    .where(and(eq(dogs.id, dogId), eq(dogs.ownerId, userId)));
  return dog ?? null;
}
```

Chain onto `dogsApp` (after `.post("/", …)`), keeping the single chained expression:
```ts
  .get("/:id", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [concerns, goals] = await Promise.all([
      db.select().from(behaviorConcerns).where(eq(behaviorConcerns.dogId, dog.id)),
      db.select().from(trainingGoals).where(eq(trainingGoals.dogId, dog.id)),
    ]);
    return c.json({ dog, concerns, goals });
  })
  .put("/:id", zValidator("json", dogProfileSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [updated] = await db
      .update(dogs)
      .set({ ...c.req.valid("json"), updatedAt: new Date() })
      .where(eq(dogs.id, dog.id))
      .returning();
    return c.json({ dog: updated });
  })
  .delete("/:id", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    await db.delete(dogs).where(eq(dogs.id, dog.id));
    return c.json({ ok: true } as const);
  });
```
(The `.get("/:id")` etc. must remain part of the same `new Hono<…>()....` chain so `AppType` infers them. `id` is a uuid string — Drizzle/Postgres compares as text; an invalid-uuid string simply matches no row → 404, which is correct behavior, no extra guard needed.)

- [ ] **Step 4: Run → GREEN**

`set -a && . ./.env && set +a && pnpm --filter @turingcare/api test dogs` → all pass.
`set -a && . ./.env && set +a && pnpm --filter @turingcare/api exec tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git -c commit.gpgsign=false commit -m "feat(api): dog get/update/delete with owner isolation" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Concern & goal sub-list endpoints

**Files:** Modify `apps/api/src/routes/dogs.ts`, `apps/api/src/routes/dogs.test.ts`

- [ ] **Step 1: Append failing tests** to `apps/api/src/routes/dogs.test.ts`:

```ts
describe("dogs: concerns & goals", () => {
  const users: TestUser[] = [];
  afterEach(async () => {
    while (users.length) await users.pop()!.cleanup();
  });
  async function makeDog(u: TestUser) {
    const res = await app.request("/api/dogs", {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify(validDog),
    });
    return ((await res.json()) as { dog: { id: string } }).dog;
  }

  it("adds and removes a concern; appears in GET", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const add = await app.request(`/api/dogs/${dog.id}/concerns`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ concern: "Leash reactivity", severity: "moderate" }),
    });
    expect(add.status).toBe(201);
    const { concern } = (await add.json()) as { concern: { id: string } };

    const got = await app.request(`/api/dogs/${dog.id}`, { headers: u.authHeaders });
    expect(((await got.json()) as { concerns: unknown[] }).concerns).toHaveLength(1);

    const del = await app.request(`/api/dogs/${dog.id}/concerns/${concern.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(del.status).toBe(200);
    const after = await app.request(`/api/dogs/${dog.id}`, { headers: u.authHeaders });
    expect(((await after.json()) as { concerns: unknown[] }).concerns).toEqual([]);
  });

  it("adds and removes a goal", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const add = await app.request(`/api/dogs/${dog.id}/goals`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ goal: "Calm greetings" }),
    });
    expect(add.status).toBe(201);
    const { goal } = (await add.json()) as { goal: { id: string } };
    const del = await app.request(`/api/dogs/${dog.id}/goals/${goal.id}`, {
      method: "DELETE",
      headers: u.authHeaders,
    });
    expect(del.status).toBe(200);
  });

  it("invalid concern body → 400", async () => {
    const u = await createTestUser();
    users.push(u);
    const dog = await makeDog(u);
    const res = await app.request(`/api/dogs/${dog.id}/concerns`, {
      method: "POST",
      headers: u.authHeaders,
      body: JSON.stringify({ concern: "", severity: "nope" }),
    });
    expect(res.status).toBe(400);
  });

  it("owner isolation: cannot add a concern to another user's dog", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    users.push(a, b);
    const dog = await makeDog(a);
    const res = await app.request(`/api/dogs/${dog.id}/concerns`, {
      method: "POST",
      headers: b.authHeaders,
      body: JSON.stringify({ concern: "x", severity: "mild" }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run → RED**

`set -a && . ./.env && set +a && pnpm --filter @turingcare/api test dogs` → new tests FAIL.

- [ ] **Step 3: Implement** — add schema imports and chain four routes.

Update the shared import in `dogs.ts`:
```ts
import { behaviorConcernSchema, dogProfileSchema, trainingGoalSchema } from "@turingcare/shared";
```
Chain onto `dogsApp` (after `.delete("/:id", …)`, still one chained expression):
```ts
  .post("/:id/concerns", zValidator("json", behaviorConcernSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [concern] = await db
      .insert(behaviorConcerns)
      .values({ ...c.req.valid("json"), dogId: dog.id })
      .returning();
    return c.json({ concern }, 201);
  })
  .delete("/:id/concerns/:concernId", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    await db
      .delete(behaviorConcerns)
      .where(
        and(
          eq(behaviorConcerns.id, c.req.param("concernId")),
          eq(behaviorConcerns.dogId, dog.id),
        ),
      );
    return c.json({ ok: true } as const);
  })
  .post("/:id/goals", zValidator("json", trainingGoalSchema), async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    const [goal] = await db
      .insert(trainingGoals)
      .values({ ...c.req.valid("json"), dogId: dog.id })
      .returning();
    return c.json({ goal }, 201);
  })
  .delete("/:id/goals/:goalId", async (c) => {
    const dog = await findOwnedDog(c.get("userId"), c.req.param("id"));
    if (!dog) return c.json({ error: "not_found" } as const, 404);
    await db
      .delete(trainingGoals)
      .where(and(eq(trainingGoals.id, c.req.param("goalId")), eq(trainingGoals.dogId, dog.id)));
    return c.json({ ok: true } as const);
  });
```

- [ ] **Step 4: Run → GREEN + full api gate**

`set -a && . ./.env && set +a && pnpm --filter @turingcare/api test` → ALL api tests pass.
`set -a && . ./.env && set +a && pnpm --filter @turingcare/api exec tsc --noEmit` → 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts
git -c commit.gpgsign=false commit -m "feat(api): concern & goal sub-list endpoints (owner-scoped)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: i18n catalog — `dogs.*` (English + Spanish)

**Files:** Modify `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`

The `en` catalog is the source of truth; `es satisfies Messages` enforces parity at compile time, and the existing `i18n.test.tsx` parity + no-untranslated tests run at runtime. Add a `dogs` section to BOTH, with identical key trees.

- [ ] **Step 1: Add the `dogs` section to `apps/web/src/i18n/en.ts`** — insert a `dogs: { … }` entry into the `en` object (e.g. directly after the `app: { … }` section, before `common:`), keeping the `as const`:

```ts
  dogs: {
    listTitle: "Your dogs",
    empty: "No dogs yet. Add your first dog to start a profile.",
    add: "Add dog",
    back: "Back to dogs",
    edit: "Edit profile",
    delete: "Delete dog",
    deleteConfirm: "Delete this dog? This permanently removes the profile and its concerns and goals.",
    deleteCancel: "Cancel",
    deleteYes: "Yes, delete",
    createTitle: "Add a dog",
    editTitle: "Edit profile",
    save: "Save",
    saving: "Saving…",
    cancel: "Cancel",
    fieldName: "Name",
    fieldBreed: "Breed",
    fieldDob: "Date of birth",
    fieldSize: "Size",
    fieldWeight: "Weight (lbs)",
    fieldSex: "Sex",
    fieldSpayedNeutered: "Spayed / neutered",
    fieldSource: "Source",
    fieldAdoptedAt: "Adopted on",
    fieldVaccineStage: "Vaccination",
    fieldNotes: "Notes",
    sizeSmall: "Small",
    sizeMedium: "Medium",
    sizeLarge: "Large",
    sizeGiant: "Giant",
    sexMale: "Male",
    sexFemale: "Female",
    sourceBreeder: "Breeder",
    sourceRescue: "Rescue",
    sourceShelter: "Shelter",
    sourceOther: "Other",
    vaccineInProgress: "In progress",
    vaccineComplete: "Complete",
    vaccineUnknown: "Unknown",
    concernsTitle: "Behavior concerns",
    concernsEmpty: "No concerns logged.",
    concernPlaceholder: "Describe a concern",
    addConcern: "Add concern",
    severityMild: "Mild",
    severityModerate: "Moderate",
    severitySevere: "Severe",
    goalsTitle: "Training goals",
    goalsEmpty: "No goals yet.",
    goalPlaceholder: "Describe a goal",
    addGoal: "Add goal",
    remove: "Remove",
    loadError: "Couldn't load your dogs.",
    saved: "Saved",
    deleted: "Dog deleted",
    saveFailed: "Save failed",
  },
```

- [ ] **Step 2: Add the SAME key tree to `apps/web/src/i18n/es.ts`** in the same position, Spanish values (glossary: "perro", warm/plain, Latin-American-neutral; brand untranslated):

```ts
  dogs: {
    listTitle: "Tus perros",
    empty: "Aún no hay perros. Agrega tu primer perro para empezar un perfil.",
    add: "Agregar perro",
    back: "Volver a tus perros",
    edit: "Editar perfil",
    delete: "Eliminar perro",
    deleteConfirm: "¿Eliminar este perro? Esto borra de forma permanente el perfil y sus conductas y objetivos.",
    deleteCancel: "Cancelar",
    deleteYes: "Sí, eliminar",
    createTitle: "Agregar un perro",
    editTitle: "Editar perfil",
    save: "Guardar",
    saving: "Guardando…",
    cancel: "Cancelar",
    fieldName: "Nombre",
    fieldBreed: "Raza",
    fieldDob: "Fecha de nacimiento",
    fieldSize: "Tamaño",
    fieldWeight: "Peso (lb)",
    fieldSex: "Sexo",
    fieldSpayedNeutered: "Esterilizado/a",
    fieldSource: "Origen",
    fieldAdoptedAt: "Fecha de adopción",
    fieldVaccineStage: "Vacunación",
    fieldNotes: "Notas",
    sizeSmall: "Pequeño",
    sizeMedium: "Mediano",
    sizeLarge: "Grande",
    sizeGiant: "Gigante",
    sexMale: "Macho",
    sexFemale: "Hembra",
    sourceBreeder: "Criador",
    sourceRescue: "Rescate",
    sourceShelter: "Refugio",
    sourceOther: "Otro",
    vaccineInProgress: "En curso",
    vaccineComplete: "Completa",
    vaccineUnknown: "Desconocida",
    concernsTitle: "Conductas a trabajar",
    concernsEmpty: "Sin conductas registradas.",
    concernPlaceholder: "Describe una conducta",
    addConcern: "Agregar conducta",
    severityMild: "Leve",
    severityModerate: "Moderada",
    severitySevere: "Grave",
    goalsTitle: "Objetivos de adiestramiento",
    goalsEmpty: "Aún no hay objetivos.",
    goalPlaceholder: "Describe un objetivo",
    addGoal: "Agregar objetivo",
    remove: "Quitar",
    loadError: "No se pudieron cargar tus perros.",
    saved: "Guardado",
    deleted: "Perro eliminado",
    saveFailed: "No se pudo guardar",
  },
```

- [ ] **Step 3: Verify parity + typecheck**

`set -a && . ./.env && set +a && pnpm --filter @turingcare/web test i18n` → parity + no-untranslated tests pass (no `dogs.*` value equals its English counterpart; if any coincidentally matches, adjust the Spanish or — only for a true proper-noun — extend the allowlist, but none should here).
`set -a && . ./.env && set +a && pnpm --filter @turingcare/web exec tsc --noEmit` → 0 (proves `es` structurally matches `en`).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git -c commit.gpgsign=false commit -m "feat(web): i18n dogs.* catalog (en + es)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Web data hooks

**Files:** Create `apps/web/src/lib/dogs.ts`

Typed TanStack Query hooks over the `hc<AppType>` client. Hono RPC path mapping: `/api/dogs` → `api.api.dogs`; `/api/dogs/:id` → `api.api.dogs[":id"]`.

- [ ] **Step 1: Create `apps/web/src/lib/dogs.ts`**

```ts
import type { BehaviorConcernInput, DogProfile, TrainingGoalInput } from "@turingcare/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

const dogs = api.api.dogs;

export function useDogs() {
  return useQuery({
    queryKey: ["dogs"],
    queryFn: async () => {
      const res = await dogs.$get();
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).dogs;
    },
  });
}

export function useDog(id: string) {
  return useQuery({
    queryKey: ["dogs", id],
    queryFn: async () => {
      const res = await dogs[":id"].$get({ param: { id } });
      if (!res.ok) throw new Error("not_found");
      return res.json();
    },
  });
}

export function useCreateDog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: DogProfile) => {
      const res = await dogs.$post({ json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).dog;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dogs"] }),
  });
}

export function useUpdateDog(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: DogProfile) => {
      const res = await dogs[":id"].$put({ param: { id }, json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).dog;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dogs"] });
      qc.invalidateQueries({ queryKey: ["dogs", id] });
    },
  });
}

export function useDeleteDog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await dogs[":id"].$delete({ param: { id } });
      if (!res.ok) throw new Error("delete_failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dogs"] }),
  });
}

export function useAddConcern(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: BehaviorConcernInput) => {
      const res = await dogs[":id"].concerns.$post({ param: { id }, json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).concern;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dogs", id] }),
  });
}

export function useRemoveConcern(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (concernId: string) => {
      const res = await dogs[":id"].concerns[":concernId"].$delete({
        param: { id, concernId },
      });
      if (!res.ok) throw new Error("delete_failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dogs", id] }),
  });
}

export function useAddGoal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TrainingGoalInput) => {
      const res = await dogs[":id"].goals.$post({ param: { id }, json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).goal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dogs", id] }),
  });
}

export function useRemoveGoal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goalId: string) => {
      const res = await dogs[":id"].goals[":goalId"].$delete({ param: { id, goalId } });
      if (!res.ok) throw new Error("delete_failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dogs", id] }),
  });
}
```

- [ ] **Step 2: Typecheck**

`set -a && . ./.env && set +a && pnpm --filter @turingcare/web exec tsc --noEmit` → 0 (this proves the RPC path mapping matches the server `AppType`; if a path/typed-param mismatches, fix the hook call shape to match `dogsApp`, not the server).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/dogs.ts
git -c commit.gpgsign=false commit -m "feat(web): typed TanStack Query hooks for dogs" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Dog list, create/edit form, route mounting

**Files:** Create `apps/web/src/routes/dogs-list.tsx`, `apps/web/src/routes/dog-form.tsx`, `apps/web/src/routes/dogs.test.tsx`; Modify `apps/web/src/main.tsx`

- [ ] **Step 1: Create `apps/web/src/routes/dog-form.tsx`** (shared by create & edit)

```tsx
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useCreateDog, useUpdateDog } from "@/lib/dogs";
import { zodResolver } from "@hookform/resolvers/zod";
import { type DogProfile, dogProfileSchema } from "@turingcare/shared";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

const inputCls =
  "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function DogForm({ mode }: { mode: "create" | "edit" }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const create = useCreateDog();
  const update = useUpdateDog(id ?? "");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DogProfile>({
    resolver: zodResolver(dogProfileSchema),
    defaultValues: { spayedNeutered: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      const dog =
        mode === "create" ? await create.mutateAsync(values) : await update.mutateAsync(values);
      toast.success(t("dogs.saved"));
      navigate(`/app/dogs/${dog.id}`);
    } catch {
      toast.error(t("dogs.saveFailed"));
    }
  });

  return (
    <div className="mx-auto max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-bold text-slate">
        {mode === "create" ? t("dogs.createTitle") : t("dogs.editTitle")}
      </h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldName")}</span>
          <input className={inputCls} {...register("name")} />
          {errors.name && <span className="text-xs text-red-600">{errors.name.message}</span>}
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldBreed")}</span>
          <input className={inputCls} {...register("breed")} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldSize")}</span>
          <select className={inputCls} {...register("size")} defaultValue="medium">
            <option value="small">{t("dogs.sizeSmall")}</option>
            <option value="medium">{t("dogs.sizeMedium")}</option>
            <option value="large">{t("dogs.sizeLarge")}</option>
            <option value="giant">{t("dogs.sizeGiant")}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldSex")}</span>
          <select className={inputCls} {...register("sex")} defaultValue="female">
            <option value="male">{t("dogs.sexMale")}</option>
            <option value="female">{t("dogs.sexFemale")}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldSource")}</span>
          <select className={inputCls} {...register("source")} defaultValue="rescue">
            <option value="breeder">{t("dogs.sourceBreeder")}</option>
            <option value="rescue">{t("dogs.sourceRescue")}</option>
            <option value="shelter">{t("dogs.sourceShelter")}</option>
            <option value="other">{t("dogs.sourceOther")}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldVaccineStage")}</span>
          <select className={inputCls} {...register("vaccineStage")} defaultValue="unknown">
            <option value="in_progress">{t("dogs.vaccineInProgress")}</option>
            <option value="complete">{t("dogs.vaccineComplete")}</option>
            <option value="unknown">{t("dogs.vaccineUnknown")}</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register("spayedNeutered")} />
          <span className="text-sm font-medium text-slate">{t("dogs.fieldSpayedNeutered")}</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldNotes")}</span>
          <textarea className={inputCls} rows={3} {...register("notes")} />
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={isSubmitting} className="bg-slate text-cream">
            {isSubmitting ? t("dogs.saving") : t("dogs.save")}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/app")}>
            {t("dogs.cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
```
(YAGNI: optional `weightLbs`/`dateOfBirth`/`adoptedAt` are omitted from the form for this slice — they remain nullable in the schema and unset; not in scope. `register("size")` etc. resolve to the zod enums; the resolver coerces. `breed`/`notes` empty strings are acceptable to the nullable/optional schema; if zod rejects `""` for `breed` in practice, the implementer adds `setValueAs: (v) => v || undefined` to those `register` calls — note in report if needed.)

- [ ] **Step 2: Create `apps/web/src/routes/dogs-list.tsx`**

```tsx
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useI18n } from "@/i18n";
import { useDogs } from "@/lib/dogs";
import { signOut } from "@/lib/auth-client";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function DogsList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: dogs, isLoading, isError } = useDogs();

  return (
    <div className="relative mx-auto max-w-2xl p-8 space-y-4">
      <LanguageToggle className="absolute right-4 top-4" />
      <h1 className="text-2xl font-bold text-slate">{t("dogs.listTitle")}</h1>
      {isLoading && <p>{t("common.loading")}</p>}
      {isError && <p className="text-red-600">{t("dogs.loadError")}</p>}
      {dogs && dogs.length === 0 && <p className="text-slate-soft">{t("dogs.empty")}</p>}
      <ul className="space-y-2">
        {dogs?.map((d) => (
          <li key={d.id}>
            <Link
              to={`/app/dogs/${d.id}`}
              className="block rounded border border-silver p-4 hover:bg-surface-sand"
            >
              <span className="font-semibold text-slate">{d.name}</span>
              {d.breed && <span className="text-slate-soft"> · {d.breed}</span>}
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button onClick={() => navigate("/app/dogs/new")} className="bg-slate text-cream">
          {t("dogs.add")}
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            await signOut();
            toast.success(t("app.signedOut"));
            navigate("/login");
          }}
        >
          {t("app.signOut")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Mount routes in `apps/web/src/main.tsx`** — replace the single `/app` route (the `<AppHome/>` JSON dump) with the dog routes, all wrapped in `RequireAuth`. Remove the now-unused `AppHome` import. New imports + routes:

```tsx
import { DogsList } from "@/routes/dogs-list";
import { DogForm } from "@/routes/dog-form";
import { DogDetail } from "@/routes/dog-detail";
```
Replace the `<Route path="/app" … />` element with:
```tsx
            <Route
              path="/app"
              element={
                <RequireAuth>
                  <DogsList />
                </RequireAuth>
              }
            />
            <Route
              path="/app/dogs/new"
              element={
                <RequireAuth>
                  <DogForm mode="create" />
                </RequireAuth>
              }
            />
            <Route
              path="/app/dogs/:id"
              element={
                <RequireAuth>
                  <DogDetail />
                </RequireAuth>
              }
            />
            <Route
              path="/app/dogs/:id/edit"
              element={
                <RequireAuth>
                  <DogForm mode="edit" />
                </RequireAuth>
              }
            />
```
(`DogDetail` is created in Task 9. Until then `main.tsx` will not typecheck — Task 8's gate runs AFTER Task 9 is also done is NOT acceptable; therefore: in Task 8 add a minimal placeholder `apps/web/src/routes/dog-detail.tsx` exporting `export function DogDetail() { return null; }`, fully implemented in Task 9. This keeps each task independently green.) Delete `apps/web/src/routes/app.tsx` and its `AppHome` import (it is fully replaced; confirm nothing else imports it: `grep -rn "routes/app\"\|AppHome" apps/web/src` → only `main.tsx`).

- [ ] **Step 4: Create the placeholder `apps/web/src/routes/dog-detail.tsx`**

```tsx
export function DogDetail() {
  return null;
}
```

- [ ] **Step 5: Create `apps/web/src/routes/dogs.test.tsx`**

```tsx
import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { DogsList } from "./dogs-list";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route path="/app" element={<DogsList />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("DogsList", () => {
  it("shows the empty state when there are no dogs", async () => {
    server.use(http.get("/api/dogs", () => HttpResponse.json({ dogs: [] })));
    renderList();
    await waitFor(() =>
      expect(screen.getByText(/no dogs yet/i)).toBeInTheDocument(),
    );
  });

  it("lists the user's dogs", async () => {
    server.use(
      http.get("/api/dogs", () =>
        HttpResponse.json({ dogs: [{ id: "d1", name: "Biscuit", breed: "Aussie" }] }),
      ),
    );
    renderList();
    await waitFor(() => expect(screen.getByText("Biscuit")).toBeInTheDocument());
  });
});
```
(`msw` is already a workspace dependency — `pnpm-workspace.yaml` lists `msw:false` only as a build-script allow flag; confirm `msw` resolves: `node -e "require.resolve('msw/node')"` from `apps/web`. If `msw` is NOT resolvable in `apps/web`, instead stub fetch by passing a custom `queryFn` is not possible here — use `vi.stubGlobal("fetch", …)` returning the JSON for `/api/dogs`; implement whichever the environment supports and note it in the report.)

- [ ] **Step 6: Run web tests + typecheck + lint**

`set -a && . ./.env && set +a && pnpm --filter @turingcare/web test` → all green (i18n parity, landing, og-meta, use-in-view, new dogs list tests).
`set -a && . ./.env && set +a && pnpm --filter @turingcare/web exec tsc --noEmit` → 0.
`pnpm lint` → 0 (run `pnpm format` for format-only).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/routes/dogs-list.tsx apps/web/src/routes/dog-form.tsx apps/web/src/routes/dog-detail.tsx apps/web/src/routes/dogs.test.tsx apps/web/src/main.tsx
git rm apps/web/src/routes/app.tsx
git -c commit.gpgsign=false commit -m "feat(web): dog list + create/edit form + routes" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Dog detail — summary, concern/goal sub-lists, delete-confirm

**Files:** Modify `apps/web/src/routes/dog-detail.tsx`, `apps/web/src/routes/dogs.test.tsx`

- [ ] **Step 1: Implement `apps/web/src/routes/dog-detail.tsx`** (replace the placeholder)

```tsx
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useI18n } from "@/i18n";
import {
  useAddConcern,
  useAddGoal,
  useDeleteDog,
  useDog,
  useRemoveConcern,
  useRemoveGoal,
} from "@/lib/dogs";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

const inputCls = "flex-1 rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function DogDetail() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const { data, isLoading, isError } = useDog(id);
  const del = useDeleteDog();
  const addConcern = useAddConcern(id);
  const removeConcern = useRemoveConcern(id);
  const addGoal = useAddGoal(id);
  const removeGoal = useRemoveGoal(id);
  const [confirming, setConfirming] = useState(false);
  const [concern, setConcern] = useState("");
  const [severity, setSeverity] = useState<"mild" | "moderate" | "severe">("mild");
  const [goal, setGoal] = useState("");

  if (isLoading) return <p className="p-8">{t("common.loading")}</p>;
  if (isError || !data) return <p className="p-8 text-red-600">{t("dogs.loadError")}</p>;
  const { dog, concerns, goals } = data;

  return (
    <div className="relative mx-auto max-w-2xl p-8 space-y-6">
      <LanguageToggle className="absolute right-4 top-4" />
      <Link to="/app" className="text-sm text-slate-soft hover:underline">
        ← {t("dogs.back")}
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate">{dog.name}</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to={`/app/dogs/${dog.id}/edit`}>{t("dogs.edit")}</Link>
          </Button>
          {confirming ? (
            <>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await del.mutateAsync(dog.id);
                    toast.success(t("dogs.deleted"));
                    navigate("/app");
                  } catch {
                    toast.error(t("dogs.saveFailed"));
                  }
                }}
                className="border-red-600 text-red-600"
              >
                {t("dogs.deleteYes")}
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                {t("dogs.deleteCancel")}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setConfirming(true)}>
              {t("dogs.delete")}
            </Button>
          )}
        </div>
      </div>
      {confirming && <p className="text-sm text-red-600">{t("dogs.deleteConfirm")}</p>}

      <section className="rounded border border-silver p-4 text-sm text-slate-soft">
        {dog.breed && <div>{t("dogs.fieldBreed")}: {dog.breed}</div>}
        <div>{t("dogs.fieldSize")}: {t(`dogs.size${cap(dog.size)}` as never)}</div>
        <div>{t("dogs.fieldSex")}: {t(`dogs.sex${cap(dog.sex)}` as never)}</div>
        {dog.notes && <div>{t("dogs.fieldNotes")}: {dog.notes}</div>}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("dogs.concernsTitle")}</h2>
        {concerns.length === 0 && <p className="text-slate-soft">{t("dogs.concernsEmpty")}</p>}
        <ul className="space-y-1">
          {concerns.map((c) => (
            <li key={c.id} className="flex items-center justify-between">
              <span>
                {c.concern} · {t(`dogs.severity${cap(c.severity)}` as never)}
              </span>
              <Button variant="outline" onClick={() => removeConcern.mutate(c.id)}>
                {t("dogs.remove")}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className={inputCls}
            placeholder={t("dogs.concernPlaceholder")}
            value={concern}
            onChange={(e) => setConcern(e.target.value)}
          />
          <select
            className="rounded border border-silver bg-white px-2 text-sm"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as typeof severity)}
          >
            <option value="mild">{t("dogs.severityMild")}</option>
            <option value="moderate">{t("dogs.severityModerate")}</option>
            <option value="severe">{t("dogs.severitySevere")}</option>
          </select>
          <Button
            disabled={!concern.trim()}
            onClick={async () => {
              await addConcern.mutateAsync({ concern, severity });
              setConcern("");
            }}
          >
            {t("dogs.addConcern")}
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("dogs.goalsTitle")}</h2>
        {goals.length === 0 && <p className="text-slate-soft">{t("dogs.goalsEmpty")}</p>}
        <ul className="space-y-1">
          {goals.map((g) => (
            <li key={g.id} className="flex items-center justify-between">
              <span>{g.goal}</span>
              <Button variant="outline" onClick={() => removeGoal.mutate(g.id)}>
                {t("dogs.remove")}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className={inputCls}
            placeholder={t("dogs.goalPlaceholder")}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <Button
            disabled={!goal.trim()}
            onClick={async () => {
              await addGoal.mutateAsync({ goal });
              setGoal("");
            }}
          >
            {t("dogs.addGoal")}
          </Button>
        </div>
      </section>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
```
(The `t(\`dogs.size${cap(...)}\` as never)` casts a dynamic key; the keys all exist in the catalog so the runtime resolves. If `MessageKey` typing rejects the template even with `as never`, the implementer replaces these three dynamic lookups with explicit maps, e.g. `const SIZE = { small: t("dogs.sizeSmall"), medium: t("dogs.sizeMedium"), large: t("dogs.sizeLarge"), giant: t("dogs.sizeGiant") }` built in-component — note which approach was used in the report. Severity `cap("mild")→"Mild"` matches `dogs.severityMild`. enum `in_progress` is NOT used dynamically here, so no underscore-casing issue.)

- [ ] **Step 2: Append a detail render test** to `apps/web/src/routes/dogs.test.tsx`:

```tsx
import { DogDetail } from "./dog-detail";

describe("DogDetail", () => {
  it("renders profile + concerns + goals", async () => {
    server.use(
      http.get("/api/dogs/:id", () =>
        HttpResponse.json({
          dog: { id: "d1", name: "Biscuit", breed: "Aussie", size: "medium", sex: "female" },
          concerns: [{ id: "c1", concern: "Leash reactivity", severity: "moderate" }],
          goals: [{ id: "g1", goal: "Calm greetings" }],
        }),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider>
          <MemoryRouter initialEntries={["/app/dogs/d1"]}>
            <Routes>
              <Route path="/app/dogs/:id" element={<DogDetail />} />
            </Routes>
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText("Biscuit")).toBeInTheDocument());
    expect(screen.getByText(/Leash reactivity/)).toBeInTheDocument();
    expect(screen.getByText("Calm greetings")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run → GREEN; typecheck; lint**

`set -a && . ./.env && set +a && pnpm --filter @turingcare/web test` → all pass.
`set -a && . ./.env && set +a && pnpm --filter @turingcare/web exec tsc --noEmit` → 0.
`pnpm lint` → 0 (`pnpm format` for format-only allowed).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/dog-detail.tsx apps/web/src/routes/dogs.test.tsx
git -c commit.gpgsign=false commit -m "feat(web): dog detail — summary, concern/goal sub-lists, delete-confirm" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Full gate, PROJECT-LOG, ship as PR

**Files:** Modify `docs/PROJECT-LOG.md`

- [ ] **Step 1: Whole-repo gate**

```bash
set -a && . ./.env && set +a
pnpm -r exec tsc --noEmit          # exit 0
pnpm -r test                       # shared + api (incl. dogs owner-isolation) + web all green
pnpm -r build                      # all workspaces build
pnpm lint                          # 0
git status --porcelain             # clean except untracked .claude/
git diff --stat main -- package.json pnpm-lock.yaml 'apps/api/fly.toml' 'apps/api/Dockerfile.api'
```
Expected: all green; the last command EMPTY (no dependency/lockfile/infra change in this whole sub-project — `react-hook-form`/`@hookform/resolvers` were already deps). If `pnpm -r test` shows a flaky/unrelated pre-existing failure, capture exact output and report DONE_WITH_CONCERNS — do not fix out-of-scope code.

- [ ] **Step 2: Append PROJECT-LOG entry** — append at the bottom of `docs/PROJECT-LOG.md` (match the file's `## YYYY-MM-DD — Title — SHIPPED` style; leave prior entries byte-intact):

```markdown
## 2026-05-17 — Dog Profile CRUD (sub-project C) — SHIPPED
Multi-dog, owner-scoped CRUD over the session-1 tables: 9 Hono endpoints
(`/api/dogs` list/create/get/update/delete + concern & goal sub-lists), every
mutating route owner-isolation-tested (404, no existence leak). Web: list →
detail (concern/goal sub-lists + delete-confirm) → create/edit forms replacing
the `/app` JSON placeholder; typed TanStack Query hooks via hc<AppType>. All
copy localized (en+es parity). No DB migration, no new deps, no apps/api infra
change. Shipped as a PR from the worktree-dog-profile-crud worktree.
- Spec/plan: `specs/2026-05-17-dog-profile-crud-design.md`, `plans/2026-05-17-dog-profile-crud.md`
- Commits: this branch (see `git log`).
```

- [ ] **Step 3: Commit**

```bash
git add docs/PROJECT-LOG.md
git -c commit.gpgsign=false commit -m "docs: PROJECT-LOG entry for Dog Profile CRUD" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Finish via superpowers:finishing-a-development-branch**

Verify tests pass (Step 1), then use the skill and choose **"Push and create a Pull Request"**. The PR body summarizes: multi-dog owner-scoped CRUD + concern/goal sub-lists, localized, owner-isolation tested, no migration/deps/infra change. Do NOT merge to `main` here; leave the worktree intact for PR iteration (the skill preserves it for option 2).

---

## Self-Review

**Spec coverage:**
- Multi-dog, owner-scoped, no migration → Tasks 3–5 (server owner checks; `findOwnedDog`); no schema/migration touched anywhere.
- Reuse `dogProfileSchema`; add concern/goal schemas → Task 1.
- 9 endpoints exactly as the spec table (list/create/get/update/delete + concerns POST/DELETE + goals POST/DELETE), 401/404/400 semantics, 404-not-403 → Tasks 3 (list/create + 401), 4 (get/update/delete + isolation 404), 5 (concern/goal + isolation 404 + 400).
- Owner isolation tested for every mutating endpoint → Tasks 3 (list isolation), 4 (get/put/delete isolation), 5 (concern add isolation; delete scoped by `and(eq(id),eq(dogId))`).
- `.route("/api/dogs", dogsApp)` keeps `AppType` inference → Task 3 Step 4; web hooks typed against it → Task 7 (typecheck proves the contract).
- 4 web routes replacing `/app` JSON dump; list+empty, detail with concern/goal sub-lists, create/edit forms, delete-confirm dialog → Tasks 8 (list/form/mount, delete app.tsx) & 9 (detail + inline confirm).
- react-hook-form + zod resolver → Task 8 (already-present deps; spec's "new deps" flag corrected to "no dep change").
- Full i18n en+es parity, enum option labels, toasts → Task 6 (+ used by Tasks 8/9; parity test enforced).
- Tests: shared schema units, api owner-isolation, web list+create/detail render; gates → Tasks 1,3,4,5,8,9,10.
- Single PR from the worktree, no main commit, no infra/deps/migration → Task 10 + Conventions header.
No gaps.

**Placeholder scan:** All code blocks are complete and real (schemas, router, helper, hooks, three components, tests). The only conditional instructions are explicit, bounded fallbacks tied to a concrete check (msw resolvability in Task 8 Step 5; the `breed`/`notes` empty-string `setValueAs` in Task 8 Step 1; the dynamic-`t()` key cast vs. explicit-map in Task 9 Step 1) — each names the exact alternative and a report note, not "TBD". The `dog-detail.tsx` placeholder in Task 8 is intentionally a real one-line component, fully replaced in Task 9, so each task stays independently green.

**Type/consistency:** `findOwnedDog`, `dogsApp`, `requireUser` names consistent across Tasks 3–5; the chained `new Hono<{Variables:Vars}>()....` stays one expression so `AppType` infers (`.route("/api/dogs", dogsApp)` in app.ts). Web hook RPC paths (`api.api.dogs`, `dogs[":id"]`, `.concerns`, `[":concernId"]`, `.goals`, `[":goalId"]`) mirror the server route params exactly; `useDog` returns `{ dog, concerns, goals }` consumed verbatim in `dog-detail.tsx`; `DogProfile`/`BehaviorConcernInput`/`TrainingGoalInput` (Task 1) are the mutation arg types in Task 7 and the form type in Task 8. i18n keys used in Tasks 8/9 (`dogs.*`) are exactly those defined in Task 6 (`fieldName`, `size{Small|Medium|Large|Giant}`, `sex{Male|Female}`, `severity{Mild|Moderate|Severe}`, etc.). Severity capitalization (`cap("moderate")→"Moderate"` ⇒ `dogs.severityModerate`) matches the catalog keys. Routes registered in `main.tsx` (`/app`, `/app/dogs/new`, `/app/dogs/:id`, `/app/dogs/:id/edit`) match the `<Link>`/`navigate` targets in the components.
