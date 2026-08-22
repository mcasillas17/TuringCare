# Brief Share Privacy Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce one active public Behavior Brief link per dog, revoke it whenever a new
Brief is explicitly generated, and stop time-window selection from creating versions.

**Architecture:** Keep tokens on immutable `briefs` rows, add a PostgreSQL partial unique
index for one non-null token per dog, and serialize generate/share/revoke through a
dog-scoped transaction advisory lock. Make TanStack Query's `["brief", dogId]` cache the
web source of truth and require an explicit Generate/Regenerate action after choosing a
time window.

**Tech Stack:** TypeScript, Hono, Drizzle ORM, PostgreSQL, Vitest, React 19, TanStack Query,
Testing Library, typed English/Spanish i18n.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `apps/api/src/db/schema.ts` | Declare the one-active-share partial unique index. |
| `apps/api/drizzle/0020_brief_share_privacy.sql` | Clean historical hidden tokens, then create the index. |
| `apps/api/drizzle/meta/0020_snapshot.json` | Drizzle schema snapshot generated with migration 0020. |
| `apps/api/drizzle/meta/_journal.json` | Register migration 0020. |
| `apps/api/src/db/schema.test.ts` | Pin the custom migration cleanup and index SQL. |
| `apps/api/src/lib/brief-lifecycle.ts` | Own the dog-scoped Brief lifecycle advisory lock and transaction wrapper. |
| `apps/api/src/lib/brief-lifecycle.test.ts` | Prove lock serialization and independence across dogs. |
| `apps/api/src/routes/dogs.ts` | Apply locked transactions to generate/share/revoke. |
| `apps/api/src/routes/dogs.test.ts` | Cover concurrent generation versions and generation rollback behavior. |
| `apps/api/src/routes/share.test.ts` | Cover multi-version privacy, owner isolation, whitelist, and operation ordering. |
| `apps/web/src/lib/brief.ts` | Make the Brief query cache authoritative after mutations. |
| `apps/web/src/lib/brief.test.tsx` | Exercise real QueryClient updates for generate/share/revoke. |
| `apps/web/src/routes/brief.tsx` | Separate window selection from persistence and confirm shared-link revocation. |
| `apps/web/src/routes/brief.test.tsx` | Cover explicit generation and confirmation behavior. |
| `apps/web/src/components/brief/share-sheet.tsx` | Remove the component-local token shadow state. |
| `apps/web/src/components/brief/share-sheet.test.tsx` | Prove the sheet follows its Brief prop after version/revoke changes. |
| `apps/web/src/i18n/en.ts` | Add English regeneration privacy copy. |
| `apps/web/src/i18n/es.ts` | Add matching Spanish regeneration privacy copy. |
| `docs/PROJECT-LOG.md` | Record the completed privacy hardening milestone. |

## Task 1: Database invariant and privacy-biased migration

**Files:**
- Modify: `apps/api/src/db/schema.ts:553-563`
- Modify: `apps/api/src/db/schema.test.ts`
- Create: `apps/api/drizzle/0020_brief_share_privacy.sql`
- Create: `apps/api/drizzle/meta/0020_snapshot.json`
- Modify: `apps/api/drizzle/meta/_journal.json`

- [ ] **Step 1: Write the failing schema and migration tests**

Import `briefs` alongside the existing schema exports. Add a schema declaration test:

```ts
it("declares one active Brief share per dog", () => {
  const index = getTableConfig(briefs).indexes.find(
    ({ config }) => config.name === "briefs_one_active_share_per_dog_idx",
  );

  expect(index).toBeDefined();
  expect(index?.config.unique).toBe(true);
  expect(index?.config.columns.map((column) => ("name" in column ? column.name : null))).toEqual([
    "dog_id",
  ]);
  expect(summarizeSql(index?.config.where)).toEqual([
    { kind: "column", name: "share_token" },
    { kind: "string", value: " IS NOT NULL" },
  ]);
});
```

Add a static migration test:

```ts
it("clears superseded Brief tokens before enforcing one active share per dog", () => {
  const migrationSql = readFileSync(
    new URL("../../drizzle/0020_brief_share_privacy.sql", import.meta.url),
    "utf8",
  );

  expect(migrationSql).toMatch(/row_number\(\) OVER/);
  expect(migrationSql).toMatch(/PARTITION BY "dog_id"/);
  expect(migrationSql).toMatch(/"version" DESC, "generated_at" DESC, "id" DESC/);
  expect(migrationSql).toMatch(/SET "share_token" = NULL/);
  expect(migrationSql).toMatch(/"brief_rank" > 1/);
  expect(migrationSql).toMatch(
    /CREATE UNIQUE INDEX "briefs_one_active_share_per_dog_idx".*WHERE .*"share_token" IS NOT NULL/s,
  );
});
```

- [ ] **Step 2: Run the tests and verify the missing migration/index failures**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" \
  pnpm --filter @turingcare/api exec vitest run src/db/schema.test.ts
```

Expected: FAIL because `0020_brief_share_privacy.sql` does not exist and the schema does
not declare `briefs_one_active_share_per_dog_idx`.

- [ ] **Step 3: Declare the partial unique index**

Change the `briefs` declaration to:

```ts
export const briefs = pgTable(
  "briefs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    dogId: uuid("dog_id")
      .notNull()
      .references(() => dogs.id, { onDelete: "cascade" }),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    status: briefStatusEnum("status").notNull().default("draft"),
    summary: text("summary").notNull(),
    version: integer("version").notNull().default(1),
    shareToken: text("share_token").unique(),
  },
  (t) => [
    uniqueIndex("briefs_one_active_share_per_dog_idx")
      .on(t.dogId)
      .where(sql`${t.shareToken} IS NOT NULL`),
  ],
);
```

- [ ] **Step 4: Generate the named migration**

Export the local environment and run:

```bash
set -a && . ./.env && set +a
PATH="/opt/homebrew/opt/node@22/bin:$PATH" \
  pnpm --filter @turingcare/api exec drizzle-kit generate --name brief_share_privacy
```

Expected: Drizzle creates `apps/api/drizzle/0020_brief_share_privacy.sql`, updates
`apps/api/drizzle/meta/_journal.json`, and creates
`apps/api/drizzle/meta/0020_snapshot.json`.

- [ ] **Step 5: Add deterministic cleanup before the generated index statement**

Place this SQL before `CREATE UNIQUE INDEX` in
`apps/api/drizzle/0020_brief_share_privacy.sql`:

```sql
WITH "ranked_briefs" AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "dog_id"
      ORDER BY "version" DESC, "generated_at" DESC, "id" DESC
    ) AS "brief_rank"
  FROM "briefs"
)
UPDATE "briefs"
SET "share_token" = NULL
FROM "ranked_briefs"
WHERE "briefs"."id" = "ranked_briefs"."id"
  AND "ranked_briefs"."brief_rank" > 1
  AND "briefs"."share_token" IS NOT NULL;
```

Keep Drizzle's generated partial unique index statement after this query.

- [ ] **Step 6: Apply the committed migration and rerun the schema tests**

Run:

```bash
set -a && . ./.env && set +a
PATH="/opt/homebrew/opt/node@22/bin:$PATH" pnpm db:migrate
PATH="/opt/homebrew/opt/node@22/bin:$PATH" \
  pnpm --filter @turingcare/api exec vitest run src/db/schema.test.ts
```

Expected: migration succeeds; schema tests PASS, including the index declaration and
static cleanup assertions.

- [ ] **Step 7: Commit the database invariant**

```bash
git add apps/api/src/db/schema.ts apps/api/src/db/schema.test.ts \
  apps/api/drizzle/0020_brief_share_privacy.sql \
  apps/api/drizzle/meta/0020_snapshot.json apps/api/drizzle/meta/_journal.json
git commit -m "feat(api): enforce one active Brief share per dog"
```

## Task 2: Brief lifecycle transaction boundary

**Files:**
- Create: `apps/api/src/lib/brief-lifecycle.ts`
- Create: `apps/api/src/lib/brief-lifecycle.test.ts`

- [ ] **Step 1: Write failing lock serialization tests**

Create `apps/api/src/lib/brief-lifecycle.test.ts` using an independent `pg.Pool` connection
as in `safety-lock.test.ts`. Test that a second callback for the same dog waits:

```ts
it("serializes lifecycle callbacks for the same dog", async () => {
  const first = deferred<void>();
  const release = deferred<void>();
  const order: string[] = [];

  const firstRun = withBriefLifecycleLock(DOG_ID, async () => {
    order.push("first-start");
    first.resolve();
    await release.promise;
    order.push("first-end");
  });
  await first.promise;

  const secondRun = withBriefLifecycleLock(DOG_ID, async () => {
    order.push("second");
  });
  await waitForBriefLifecycleWaiter(pool);
  expect(order).toEqual(["first-start"]);

  release.resolve();
  await Promise.all([firstRun, secondRun]);
  expect(order).toEqual(["first-start", "first-end", "second"]);
});
```

Test that two different dog IDs do not block one another:

```ts
it("allows different dogs to proceed independently", async () => {
  const first = deferred<void>();
  const release = deferred<void>();

  const held = withBriefLifecycleLock(DOG_ID, async () => {
    first.resolve();
    await release.promise;
  });
  await first.promise;

  await expect(withBriefLifecycleLock(OTHER_DOG_ID, async () => "ready")).resolves.toBe("ready");
  release.resolve();
  await held;
});
```

Define `deferred`, `waitForBriefLifecycleWaiter`, valid UUID constants, and pool cleanup in
this test file; never use timers as proof that a lock is waiting.

- [ ] **Step 2: Run the lock tests and verify the missing-module failure**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" \
  pnpm --filter @turingcare/api exec vitest run src/lib/brief-lifecycle.test.ts
```

Expected: FAIL because `brief-lifecycle.ts` does not exist.

- [ ] **Step 3: Implement the named lifecycle lock**

Create `apps/api/src/lib/brief-lifecycle.ts`:

```ts
import { sql } from "drizzle-orm";
import { db } from "../db";

export type BriefLifecycleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockBriefLifecycle(
  tx: Pick<typeof db, "execute">,
  dogId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`brief-lifecycle:${dogId}`}))`,
  );
}

export function withBriefLifecycleLock<T>(
  dogId: string,
  callback: (tx: BriefLifecycleTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await lockBriefLifecycle(tx, dogId);
    return callback(tx);
  });
}
```

The names must continue to predict the contents: `lockBriefLifecycle` only acquires the
lock, while `withBriefLifecycleLock` owns both the transaction and callback execution.

- [ ] **Step 4: Run the focused lock tests**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" \
  pnpm --filter @turingcare/api exec vitest run src/lib/brief-lifecycle.test.ts
```

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit the lifecycle boundary**

```bash
git add apps/api/src/lib/brief-lifecycle.ts apps/api/src/lib/brief-lifecycle.test.ts
git commit -m "feat(api): serialize Brief lifecycle operations"
```

## Task 3: Transactional generation, sharing, and revocation

**Files:**
- Modify: `apps/api/src/routes/dogs.ts:1164-1250`
- Modify: `apps/api/src/routes/dogs.test.ts:843-968`
- Modify: `apps/api/src/routes/share.test.ts`

- [ ] **Step 1: Write failing multi-version privacy tests**

Extend `apps/api/src/routes/share.test.ts` with a helper that mints and returns a token.
Add:

```ts
it("revokes the old link when a new private Brief is generated", async () => {
  const { cookie, dogId } = await setupSharedBrief("regenerate");
  const oldToken = await mintShare(cookie, dogId);

  const generated = await app.request(`/api/dogs/${dogId}/brief?window=7d`, {
    method: "POST",
    headers: { cookie },
  });
  expect(generated.status).toBe(201);
  const body = (await generated.json()) as {
    brief: { version: number; shareToken: string | null };
  };

  expect(body.brief.version).toBe(2);
  expect(body.brief.shareToken).toBeNull();
  expect((await app.request(`/api/share/brief/${oldToken}`)).status).toBe(404);
});
```

Add a defensive revoke test by inserting an old token directly on version 1 and a private
version 2, then calling DELETE and asserting every row for the dog has `shareToken: null`.
Because Task 1's index permits only one active token, this fixture accurately models the
single hidden-old-link state that migration and routes must handle.

Add share ownership checks for another signed-in user:

```ts
expect(
  (
    await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "POST",
      headers: { cookie: otherCookie },
    })
  ).status,
).toBe(404);
expect(
  (
    await app.request(`/api/dogs/${dogId}/brief/share`, {
      method: "DELETE",
      headers: { cookie: otherCookie },
    })
  ).status,
).toBe(404);
```

Add a live database-invariant test after creating two dogs with Briefs:

```ts
await db
  .update(briefs)
  .set({ shareToken: "first-dog-token" })
  .where(eq(briefs.dogId, firstDogId));
await db
  .update(briefs)
  .set({ shareToken: "second-dog-token" })
  .where(eq(briefs.dogId, secondDogId));

await expect(
  db
    .insert(briefs)
    .values({
      dogId: firstDogId,
      summary: "newer",
      version: 2,
      shareToken: "duplicate-dog-token",
    }),
).rejects.toThrow();
```

This proves different dogs may each share one Brief while the database rejects a second
active token for the same dog.

Add a rollback test using the real lifecycle transaction:

```ts
const token = await mintShare(cookie, dogId);
await expect(
  withBriefLifecycleLock(dogId, async (tx) => {
    await tx.update(briefs).set({ shareToken: null }).where(eq(briefs.dogId, dogId));
    await tx.insert(briefs).values({
      dogId,
      summary: null as unknown as string,
      version: 2,
      status: "draft",
    });
  }),
).rejects.toThrow();
expect((await app.request(`/api/share/brief/${token}`)).status).toBe(200);
```

The invalid null summary forces PostgreSQL to reject the insert after revocation; the
assertion proves the transaction rolls both writes back. The cast is confined to this
negative database-boundary test and does not weaken application types.

- [ ] **Step 2: Tighten the public response whitelist assertion**

Replace property-by-property negative checks with an exact key assertion:

```ts
expect(Object.keys(body.brief).sort()).toEqual(
  ["dogName", "generatedAt", "status", "summary", "version"].sort(),
);
```

Retain the revoked and unknown token 404 assertions.

- [ ] **Step 3: Write failing concurrency tests**

In `apps/api/src/routes/dogs.test.ts`, add a two-generation test:

```ts
it("assigns distinct sequential versions to concurrent generations", async () => {
  const user = await createTestUser();
  users.push(user);
  const dog = await makeDog(user);

  const responses = await Promise.all([
    app.request(`/api/dogs/${dog.id}/brief?window=7d`, {
      method: "POST",
      headers: user.authHeaders,
    }),
    app.request(`/api/dogs/${dog.id}/brief?window=30d`, {
      method: "POST",
      headers: user.authHeaders,
    }),
  ]);
  const versions = await Promise.all(
    responses.map(async (response) => {
      expect(response.status).toBe(201);
      return ((await response.json()) as { brief: { version: number } }).brief.version;
    }),
  );

  expect(versions.sort()).toEqual([1, 2]);
});
```

In `share.test.ts`, hold `lockBriefLifecycle` in an independent transaction, start Share,
wait for an advisory waiter through `pg_locks`, insert and commit a newer private Brief,
then assert Share targets the newly committed latest version. Add the inverse ordering:
commit a token assignment before starting Generate, then assert Generate clears it.

Use deferred promises and `pg_locks` observations copied from established contextual
progress tests. Do not use `setTimeout` to infer ordering.

- [ ] **Step 4: Run focused route tests and verify failures**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" \
  pnpm --filter @turingcare/api exec vitest run \
  src/routes/share.test.ts src/routes/dogs.test.ts
```

Expected failures:

- old public token still returns 200 after generation;
- revoke leaves an old-version token active;
- concurrent generation can assign duplicate versions or surface an index conflict;
- Share reads the latest Brief before it obtains the lifecycle lock.

- [ ] **Step 5: Move Share into the lifecycle transaction**

Import `withBriefLifecycleLock` and replace the share body after owner lookup with:

```ts
const token = await withBriefLifecycleLock(dog.id, async (tx) => {
  const [brief] = await tx
    .select()
    .from(briefs)
    .where(eq(briefs.dogId, dog.id))
    .orderBy(desc(briefs.version), desc(briefs.generatedAt), desc(briefs.id))
    .limit(1);
  if (!brief) return null;
  if (brief.shareToken) return brief.shareToken;

  await tx
    .update(briefs)
    .set({ shareToken: null })
    .where(and(eq(briefs.dogId, dog.id), isNotNull(briefs.shareToken)));

  const nextToken = randomBytes(18).toString("base64url");
  const [sharedBrief] = await tx
    .update(briefs)
    .set({ shareToken: nextToken })
    .where(eq(briefs.id, brief.id))
    .returning({ shareToken: briefs.shareToken });
  if (!sharedBrief?.shareToken) throw new Error("failed to persist Brief share token");
  return sharedBrief.shareToken;
});
if (!token) return c.json({ error: "no_brief" } as const, 404);
```

Keep `recordEvent("brief.shared", …)` and the existing response after the transaction
commits. Add `isNotNull` to the Drizzle imports.

- [ ] **Step 6: Move Revoke into the lifecycle transaction**

Replace latest-row-only revocation with:

```ts
const foundBrief = await withBriefLifecycleLock(dog.id, async (tx) => {
  const [brief] = await tx
    .select({ id: briefs.id })
    .from(briefs)
    .where(eq(briefs.dogId, dog.id))
    .limit(1);
  if (!brief) return false;

  await tx
    .update(briefs)
    .set({ shareToken: null })
    .where(and(eq(briefs.dogId, dog.id), isNotNull(briefs.shareToken)));
  return true;
});
if (!foundBrief) return c.json({ error: "not_found" } as const, 404);
return c.json({ ok: true } as const);
```

- [ ] **Step 7: Make version assignment and revocation atomic in Generate**

Keep source-data queries and `composeBrief` before the lifecycle transaction. Remove the
pre-transaction latest-Brief query from the `Promise.all`. Insert with:

```ts
const brief = await withBriefLifecycleLock(dog.id, async (tx) => {
  await tx
    .update(briefs)
    .set({ shareToken: null })
    .where(and(eq(briefs.dogId, dog.id), isNotNull(briefs.shareToken)));

  const [latest] = await tx
    .select({ version: briefs.version })
    .from(briefs)
    .where(eq(briefs.dogId, dog.id))
    .orderBy(desc(briefs.version), desc(briefs.generatedAt), desc(briefs.id))
    .limit(1);
  const [insertedBrief] = await tx
    .insert(briefs)
    .values({
      dogId: dog.id,
      summary,
      version: (latest?.version ?? 0) + 1,
      status: "draft",
    })
    .returning();
  if (!insertedBrief) throw new Error("failed to insert generated Brief");
  return insertedBrief;
});
```

Record `brief.generated` only after this transaction commits.

- [ ] **Step 8: Run the focused API tests**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" \
  pnpm --filter @turingcare/api exec vitest run \
  src/lib/brief-lifecycle.test.ts src/db/schema.test.ts \
  src/routes/share.test.ts src/routes/dogs.test.ts
```

Expected: PASS. Confirm the new concurrency tests complete without timer-based sleeps.

- [ ] **Step 9: Commit transactional Brief routes**

```bash
git add apps/api/src/routes/dogs.ts apps/api/src/routes/dogs.test.ts \
  apps/api/src/routes/share.test.ts
git commit -m "fix(api): revoke Brief shares across versions"
```

## Task 4: Authoritative Brief query cache

**Files:**
- Modify: `apps/web/src/lib/brief.ts`
- Create: `apps/web/src/lib/brief.test.tsx`
- Modify: `apps/web/src/components/brief/share-sheet.tsx`
- Modify: `apps/web/src/components/brief/share-sheet.test.tsx`

- [ ] **Step 1: Write failing real-QueryClient mutation tests**

Create `apps/web/src/lib/brief.test.tsx`. Mock the typed Hono calls, render each hook with a
real QueryClient, seed `["brief", "dog-1"]`, and assert immediate cache state after
`mutateAsync`.

Generation:

```ts
it("replaces the cached Brief with the private generated version", async () => {
  const queryClient = makeQueryClient();
  queryClient.setQueryData(["brief", "dog-1"], sharedBrief);
  postBrief.mockResolvedValue(okJson({ brief: generatedPrivateBrief }));
  const { result } = renderHook(() => useGenerateBrief("dog-1"), {
    wrapper: makeWrapper(queryClient),
  });

  await act(() => result.current.mutateAsync("7d"));

  expect(queryClient.getQueryData(["brief", "dog-1"])).toEqual(generatedPrivateBrief);
});
```

Share:

```ts
expect(queryClient.getQueryData(["brief", "dog-1"])).toEqual({
  ...privateBrief,
  shareToken: "new-token",
});
```

Revoke:

```ts
expect(queryClient.getQueryData(["brief", "dog-1"])).toEqual({
  ...sharedBrief,
  shareToken: null,
});
```

Also spy on `invalidateQueries` and retain the existing Brief and aggregate invalidations.
Stub `useTuring().celebrate` through the same provider pattern used by neighboring hook
tests.

- [ ] **Step 2: Write a failing share-sheet prop-authority test**

Change the share-sheet test setup to return Testing Library's `rerender`. Render with
`shareToken: "old-token"`, open the Link panel, then rerender the same component with a
new Brief version and `shareToken: null`:

```ts
expect(screen.getByDisplayValue(/\/b\/old-token$/)).toBeInTheDocument();
rerenderSheet({ version: 3, shareToken: null });
expect(screen.queryByDisplayValue(/\/b\/old-token$/)).not.toBeInTheDocument();
```

The test must not invoke revoke; it proves a prop change alone removes stale local state.
Update the existing create-link test so its mocked successful mutation is followed by a
rerender with `shareToken: "tok123"` before asserting the URL. This mirrors the
QueryClient-driven parent rerender instead of recreating component-local token state.

- [ ] **Step 3: Run focused web tests and verify failures**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" \
  pnpm --filter @turingcare/web exec vitest run \
  src/lib/brief.test.tsx src/components/brief/share-sheet.test.tsx
```

Expected: hook cache assertions fail because mutations only invalidate, and the sheet
continues displaying its local `createdToken`.

- [ ] **Step 4: Extract a typed Brief fetch result and update mutation caches**

In `apps/web/src/lib/brief.ts`, extract:

```ts
async function fetchBrief(dogId: string) {
  const res = await b.$get({ param: { id: dogId } });
  if (!res.ok) throw new Error("load_failed");
  return (await res.json()).brief;
}

type CachedBrief = Awaited<ReturnType<typeof fetchBrief>>;
```

Use `queryFn: () => fetchBrief(dogId)`.

For Generate:

```ts
onSuccess: (brief) => {
  qc.setQueryData<CachedBrief>(["brief", dogId], brief);
  qc.invalidateQueries({ queryKey: ["brief", dogId] });
  qc.invalidateQueries({ queryKey: ["overview"] });
},
```

For Share:

```ts
onSuccess: ({ token }) => {
  qc.setQueryData<CachedBrief>(["brief", dogId], (brief) =>
    brief ? { ...brief, shareToken: token } : brief,
  );
  celebrate(true, "turing.celebrateBrief");
  qc.invalidateQueries({ queryKey: ["brief", dogId] });
},
```

For Revoke:

```ts
onSuccess: () => {
  qc.setQueryData<CachedBrief>(["brief", dogId], (brief) =>
    brief ? { ...brief, shareToken: null } : brief,
  );
  qc.invalidateQueries({ queryKey: ["brief", dogId] });
},
```

- [ ] **Step 5: Remove the share sheet's local token shadow**

Delete `createdToken` and `setCreatedToken`. Replace:

```ts
const token = brief.shareToken ?? createdToken;
```

with:

```ts
const token = brief.shareToken;
```

`openLink` should await `share.mutateAsync()` and switch panels; the cache update causes
the new token to arrive through `brief`. Revoke should await the mutation and switch to
the menu without mutating local token state.

- [ ] **Step 6: Run focused web tests**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" \
  pnpm --filter @turingcare/web exec vitest run \
  src/lib/brief.test.tsx src/components/brief/share-sheet.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit cache authority changes**

```bash
git add apps/web/src/lib/brief.ts apps/web/src/lib/brief.test.tsx \
  apps/web/src/components/brief/share-sheet.tsx \
  apps/web/src/components/brief/share-sheet.test.tsx
git commit -m "fix(web): make Brief cache authoritative"
```

## Task 5: Explicit window generation and revocation confirmation

**Files:**
- Modify: `apps/web/src/routes/brief.tsx`
- Modify: `apps/web/src/routes/brief.test.tsx`
- Modify: `apps/web/src/i18n/en.ts`
- Modify: `apps/web/src/i18n/es.ts`

- [ ] **Step 1: Replace the old auto-generation test with explicit-action tests**

Update the existing window test:

```ts
it("selects a window without generating until Regenerate is pressed", async () => {
  const { gen } = setup(privateBrief);

  fireEvent.click(screen.getByRole("button", { name: /^7 days$/i }));
  expect(gen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /^regenerate brief$/i }));

  await waitFor(() => expect(gen).toHaveBeenCalledOnce());
  expect(gen).toHaveBeenCalledWith("7d");
});
```

Add the no-Brief case and assert **Generate brief** sends the selected window exactly once.

- [ ] **Step 2: Add failing shared-link confirmation tests**

For a Brief with `shareToken: "active-token"`:

```ts
fireEvent.click(screen.getByRole("button", { name: /^regenerate brief$/i }));
expect(screen.getByRole("dialog", { name: /stop sharing this brief/i })).toBeInTheDocument();
expect(gen).not.toHaveBeenCalled();

fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
expect(gen).not.toHaveBeenCalled();
```

In a separate test, click Continue and assert one generation with the selected window.
For a private Brief, assert Regenerate calls immediately without opening the dialog.

- [ ] **Step 3: Run the route tests and verify failures**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" \
  pnpm --filter @turingcare/web exec vitest run src/routes/brief.test.tsx
```

Expected: selection still generates immediately and no confirmation dialog exists.

- [ ] **Step 4: Add typed English and Spanish copy**

Add matching keys under `brief`:

```ts
// en.ts
regenerateShareTitle: "Stop sharing this Brief?",
regenerateShareBody:
  "Regenerating creates a private new version. The current public link will stop working.",
regenerateShareCancel: "Cancel",
regenerateShareContinue: "Stop sharing and regenerate",
```

```ts
// es.ts
regenerateShareTitle: "¿Dejar de compartir este Resumen?",
regenerateShareBody:
  "Al regenerarlo se crea una nueva versión privada. El enlace público actual dejará de funcionar.",
regenerateShareCancel: "Cancelar",
regenerateShareContinue: "Dejar de compartir y regenerar",
```

- [ ] **Step 5: Separate selection from generation**

Replace the chip handler with `onClick={() => setWindowChoice(w)}`. Rename the async
function from `regenerate` to `generateSelectedBrief` because it also handles the first
generation:

```ts
const generateSelectedBrief = async () => {
  try {
    await gen.mutateAsync(windowChoice);
  } catch {
    toast.error(t("brief.genFailed"));
  }
};
```

The empty-state Generate button calls `generateSelectedBrief`. The existing Regenerate
button either opens confirmation or calls the function directly.

- [ ] **Step 6: Add the localized confirmation sheet**

Import `Sheet`, add `const [confirmRegeneration, setConfirmRegeneration] = useState(false)`,
and make the Regenerate button:

```tsx
onClick={() => {
  if (brief.shareToken) setConfirmRegeneration(true);
  else void generateSelectedBrief();
}}
```

Render:

```tsx
<Sheet
  open={confirmRegeneration}
  title={t("brief.regenerateShareTitle")}
  closeLabel={t("brief.regenerateShareCancel")}
  onClose={() => setConfirmRegeneration(false)}
>
  <p className="text-sm text-slate-soft">{t("brief.regenerateShareBody")}</p>
  <div className="mt-4 flex justify-end gap-2">
    <Button variant="outline" onClick={() => setConfirmRegeneration(false)}>
      {t("brief.regenerateShareCancel")}
    </Button>
    <Button
      disabled={gen.isPending}
      onClick={async () => {
        await generateSelectedBrief();
        setConfirmRegeneration(false);
      }}
    >
      {t("brief.regenerateShareContinue")}
    </Button>
  </div>
</Sheet>
```

Change `generateSelectedBrief` to return `true` on success and `false` on failure, and
close the sheet only when it returns `true`; a failed request must leave the warning open
for retry:

```ts
const generated = await generateSelectedBrief();
if (generated) setConfirmRegeneration(false);
```

- [ ] **Step 7: Run focused route and share-sheet tests**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" \
  pnpm --filter @turingcare/web exec vitest run \
  src/routes/brief.test.tsx src/components/brief/share-sheet.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit the explicit-generation UX**

```bash
git add apps/web/src/routes/brief.tsx apps/web/src/routes/brief.test.tsx \
  apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git commit -m "feat(web): confirm private Brief regeneration"
```

## Task 6: Documentation and complete verification

**Files:**
- Modify: `docs/PROJECT-LOG.md`

- [ ] **Step 1: Add the project log entry**

Add a dated 2026-08-22 entry describing:

```markdown
### Brief Share Privacy Hardening

- Enforced one active public Brief link per dog with a PostgreSQL partial unique index.
- Made generation revoke existing links atomically and require explicit re-sharing.
- Separated time-window selection from version creation and added a revocation warning.
- Added multi-version, concurrency, cache-authority, localization, and public-whitelist coverage.
```

- [ ] **Step 2: Run formatting and static checks**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" pnpm lint
PATH="/opt/homebrew/opt/node@22/bin:$PATH" pnpm typecheck
```

Expected: both commands exit 0.

- [ ] **Step 3: Run the complete test suite**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" pnpm test
```

Expected: all shared, API, and web Vitest projects pass with zero failures.

- [ ] **Step 4: Run the production build**

Run:

```bash
PATH="/opt/homebrew/opt/node@22/bin:$PATH" pnpm build
```

Expected: all workspace builds exit 0.

- [ ] **Step 5: Verify migration reproducibility**

After obtaining explicit user consent to create and later drop the named local verification
database, create it in the existing local container, apply every committed migration,
inspect the new index, then remove only that temporary database:

```bash
docker exec turingcare-postgres createdb -U postgres turingcare_brief_privacy_verify
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/turingcare_brief_privacy_verify" \
  PATH="/opt/homebrew/opt/node@22/bin:$PATH" pnpm db:migrate
docker exec turingcare-postgres psql -U postgres -d turingcare_brief_privacy_verify \
  -c "\\d briefs"
docker exec turingcare-postgres dropdb -U postgres turingcare_brief_privacy_verify
```

Expected: migrations succeed from zero and `\d briefs` lists
`briefs_one_active_share_per_dog_idx` with `WHERE (share_token IS NOT NULL)`.

- [ ] **Step 6: Inspect the final branch diff**

Run:

```bash
git diff --check origin/main...HEAD
git status --short
git log --oneline origin/main..HEAD
```

Expected: no whitespace errors, only intended files changed, and no untracked temporary
artifacts or secret files. `.env` remains ignored and uncommitted.

- [ ] **Step 7: Commit documentation**

```bash
git add docs/PROJECT-LOG.md
git commit -m "docs: record Brief share privacy hardening"
```

- [ ] **Step 8: Request code review**

Invoke `superpowers:requesting-code-review`. Resolve all Critical and Important findings,
rerun the smallest affected checks, then repeat complete verification before declaring
the branch ready.
