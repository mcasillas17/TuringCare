# Backup Restore Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that TuringCare's Supabase production database can be restored into an isolated temporary project, validated without exposing owner content, measured for RPO/RTO, and securely destroyed.

**Architecture:** Supabase's paid-plan “Restore to a New Project” capability is the primary recovery mechanism because it clones an actual provider-managed physical backup without taking production offline. A repository script captures a non-sensitive aggregate baseline from the source database first, then connects to the temporary restore and verifies the committed migration ledger, required schema, meaningful (non-empty) data, aggregate row counts, constraint validity, and referential integrity, emitting JSON evidence that contains no owner-authored values. A restore that produced an empty clone, a clone missing required tables, or a ledger inconsistent with the committed journal fails. A restore whose ledger is merely *behind* the repository — a backup taken before the newest migration deployed — and a restore whose counts differ from the source baseline are flagged for explicit operator review with measured deltas, never silently accepted and never mislabelled as corruption. A runbook controls access, disables external side effects, records the drill timeline, and requires deletion confirmation.

**Tech Stack:** Supabase physical backups, Supabase Dashboard/Management API, PostgreSQL 17 client tools, Node 22, TypeScript, Drizzle migrator, `pg`, Vitest.

---

## Execution order

This plan ships **second**, after
`docs/superpowers/plans/2026-08-10-sentry-production-monitoring.md`. The two are
separately shippable — neither imports code from the other — but monitoring
lands first so an incident during a restore drill is already observable.

This plan appends exactly one new `DEPLOY.md` section: **`## 10. Database
recovery readiness`**, inserted after the monitoring plan's `## 9. Production
error monitoring (Sentry)` and before `## Quick reference`. If this plan ships
before the monitoring plan for any reason, number this section `## 9.` instead
and leave the numbering to the other plan. Do not edit the other plan's section.

## File map

- Create `apps/api/src/recovery/verify-restore.ts`: migration/schema/count/integrity verifier with JSON output.
- Create `apps/api/src/recovery/verify-restore.test.ts`: verifier tests against per-test throwaway databases.
- Create `apps/api/src/recovery/verify-restore-cli.ts`: runnable entrypoint and safety guards for the verifier.
- Create `apps/api/src/recovery/throwaway-database.ts`: test-only helper that creates, migrates, and drops a disposable database.
- Create `apps/api/src/recovery/throwaway-database.test.ts`: harness create/migrate/drop and non-local-host guard tests.
- Create `apps/api/src/recovery/capture-baseline.ts`: read-only source aggregate baseline CLI.
- Modify `apps/api/package.json`: `recovery:baseline` and `recovery:verify` commands.
- Create `docs/runbooks/database-recovery.md`: production incident and isolated drill procedure.
- Create `docs/runbooks/templates/restore-drill-evidence.md`: non-sensitive evidence record.
- Modify `DEPLOY.md`: new `## 10. Database recovery readiness` section.
- Modify `README.md`: recovery drill pointer.
- Modify `docs/SECURITY-BACKLOG.md`: restore-drill status.
- Modify `docs/PROJECT-LOG.md`: phase entry after the drill is completed.

### Task 1: Build the throwaway-database test harness

**Files:**
- Create: `apps/api/src/recovery/throwaway-database.ts`
- Create: `apps/api/src/recovery/throwaway-database.test.ts`

- [ ] **Step 1: Write the failing harness test**

Recovery tests must never mutate, count, or corrupt the shared local test
database: other suites insert and delete users concurrently, so any assertion on
its row counts is flaky by construction. Every recovery test gets its own
database instead, and the harness that provides it is itself tested. Create
`apps/api/src/recovery/throwaway-database.test.ts`:

```ts
import { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { createThrowawayDatabase } from "./throwaway-database";

async function databaseExists(name: string): Promise<boolean> {
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    return result.rowCount === 1;
  } finally {
    await admin.end();
  }
}

it(
  "creates a migrated database and drops it again",
  async () => {
    const database = await createThrowawayDatabase({ migrate: true });
    expect(await databaseExists(database.name)).toBe(true);

    const applied = await database.pool.query<{ count: string }>(
      'SELECT count(*) AS count FROM drizzle."__drizzle_migrations"',
    );
    expect(Number(applied.rows[0]?.count)).toBeGreaterThan(0);

    const dogs = await database.pool.query('SELECT to_regclass($1) AS table', ["public.dogs"]);
    expect(dogs.rows[0]?.table).not.toBeNull();

    await database.drop();
    expect(await databaseExists(database.name)).toBe(false);
  },
  120_000,
);

it("refuses to create a database on a non-local host", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://user:pw@db.example.com:5432/postgres");
  await expect(createThrowawayDatabase({ migrate: false })).rejects.toThrow(/local Postgres/);
  vi.unstubAllEnvs();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
docker compose up -d --wait
pnpm --filter @turingcare/api exec vitest run src/recovery/throwaway-database.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the helper**

Create `apps/api/src/recovery/throwaway-database.ts`:

```ts
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export type ThrowawayDatabase = {
  name: string;
  url: string;
  pool: Pool;
  drop: () => Promise<void>;
};

const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

function adminUrl(base: URL): string {
  const url = new URL(base);
  url.pathname = "/postgres";
  return url.toString();
}

/**
 * Test-only. Creates a uniquely named database on the LOCAL Postgres server,
 * optionally applies the committed migrations, and drops it again. Refuses to
 * run against anything but localhost so a misconfigured DATABASE_URL can never
 * create or drop databases on a managed host.
 */
export async function createThrowawayDatabase(
  options: { migrate: boolean } = { migrate: true },
): Promise<ThrowawayDatabase> {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error("DATABASE_URL is required to create a throwaway database");
  const baseUrl = new URL(base);
  if (baseUrl.hostname !== "localhost" && baseUrl.hostname !== "127.0.0.1") {
    throw new Error("throwaway databases may only be created on a local Postgres server");
  }

  const name = `turingcare_verify_${randomBytes(6).toString("hex")}`;
  const admin = new Pool({ connectionString: adminUrl(baseUrl) });
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }

  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString() });
  if (options.migrate) {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  }

  return {
    name,
    url: url.toString(),
    pool,
    drop: async () => {
      await pool.end();
      const cleanup = new Pool({ connectionString: adminUrl(baseUrl) });
      try {
        await cleanup.query(
          "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
          [name],
        );
        await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
```

The database name is generated from `randomBytes`, never from external input, so
the unavoidable identifier interpolation cannot be influenced by a caller.
`DROP DATABASE ... WITH (FORCE)` requires Postgres 13+; local Docker runs 16 and
CI runs 16.

- [ ] **Step 4: Prove the harness works and cleans up**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/recovery/throwaway-database.test.ts
```

Expected: PASS. Then confirm no database leaked:

```bash
docker compose exec -T postgres psql -U postgres -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'turingcare_verify_%'"
```

Expected: empty output.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/recovery/throwaway-database.ts apps/api/src/recovery/throwaway-database.test.ts
git commit -m "test(api): add throwaway database harness"
```

### Task 2: Build the non-sensitive restore verifier

**Files:**
- Create: `apps/api/src/recovery/verify-restore.ts`
- Create: `apps/api/src/recovery/verify-restore.test.ts`
- Create: `apps/api/src/recovery/verify-restore-cli.ts`
- Create: `apps/api/src/recovery/capture-baseline.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Write the failing verifier tests**

Each test owns its database, so counts are exact and deterministic without ever
touching the shared test database. Create
`apps/api/src/recovery/verify-restore.test.ts`:

```ts
import { afterEach, expect, it } from "vitest";
import { type ThrowawayDatabase, createThrowawayDatabase } from "./throwaway-database";
import { captureRecoverySnapshot, verifyRestore } from "./verify-restore";

const databases: ThrowawayDatabase[] = [];

async function freshDatabase(options: { migrate: boolean } = { migrate: true }) {
  const database = await createThrowawayDatabase(options);
  databases.push(database);
  return database;
}

afterEach(async () => {
  while (databases.length > 0) await databases.pop()?.drop();
});

it("reports schema, migrations, aggregates, and integrity without row content", async () => {
  const database = await freshDatabase();
  await seedSyntheticOwner(database.pool); // 1 user, 1 dog, 1 journal entry, 1 brief

  const report = await verifyRestore(database.pool);

  expect(report.failures).toEqual([]);
  expect(report.ok).toBe(true);
  expect(report.snapshot.tables.user).toEqual({ exists: true, rows: 1 });
  expect(report.snapshot.tables.dogs).toEqual({ exists: true, rows: 1 });
  expect(report.snapshot.migrations.applied).toBe(report.expectedMigrations.count);
  expect(report.snapshot.migrations.latestAppliedAt).toBe(report.expectedMigrations.latestWhen);
  expect(report.snapshot.orphans).toEqual(
    expect.objectContaining({
      dogs_without_owner: 0,
      journal_entries_without_dog: 0,
      briefs_without_dog: 0,
    }),
  );
  expect(JSON.stringify(report)).not.toContain("Synthetic Owner");
  expect(JSON.stringify(report)).not.toContain("private journal sentinel");
});

it("fails on an unmigrated clone", async () => {
  const database = await freshDatabase({ migrate: false });
  const report = await verifyRestore(database.pool);
  expect(report.ok).toBe(false);
  expect(report.failures).toContain("missing migration ledger: drizzle.__drizzle_migrations");
  expect(report.failures).toContain("missing table: public.dogs");
});

it("fails on a migrated but empty clone", async () => {
  const database = await freshDatabase();
  const report = await verifyRestore(database.pool);
  expect(report.ok).toBe(false);
  expect(report.failures).toContain("no rows restored: user");
  expect(report.failures).toContain("no rows restored: dogs");
});

it("treats a backup taken before the newest migration as reviewable lag", async () => {
  const database = await freshDatabase();
  await seedSyntheticOwner(database.pool);
  // A backup captured before the newest migration deployed: the ledger is a
  // leading subset of the committed journal, which is self-consistent, not
  // corrupt.
  await database.pool.query(
    'DELETE FROM drizzle."__drizzle_migrations" WHERE created_at = (SELECT max(created_at) FROM drizzle."__drizzle_migrations")',
  );
  const report = await verifyRestore(database.pool);
  expect(report.ok).toBe(true);
  expect(report.failures).toEqual([]);
  expect(report.requiresOperatorReview).toBe(true);
  expect(report.migrationLag).toMatchObject({
    applied: report.expectedMigrations.count - 1,
    expected: report.expectedMigrations.count,
    missing: [report.expectedMigrations.latestTag],
  });
  expect(report.warnings.join("\n")).toMatch(/migration lag/);
});

it("fails when the migration ledger is inconsistent with the repository journal", async () => {
  const database = await freshDatabase();
  await seedSyntheticOwner(database.pool);
  // Removing the OLDEST entry leaves the newest timestamp in place, so the
  // ledger is not a leading subset of the journal — that is corruption, not lag.
  await database.pool.query(
    'DELETE FROM drizzle."__drizzle_migrations" WHERE created_at = (SELECT min(created_at) FROM drizzle."__drizzle_migrations")',
  );
  const report = await verifyRestore(database.pool);
  expect(report.ok).toBe(false);
  expect(report.migrationLag).toBeUndefined();
  expect(report.failures.join("\n")).toMatch(/migration count/);
});

it("fails when a required table is absent", async () => {
  const database = await freshDatabase();
  await seedSyntheticOwner(database.pool);
  await database.pool.query('DROP TABLE "courses"');
  const report = await verifyRestore(database.pool);
  expect(report.ok).toBe(false);
  expect(report.failures).toContain("missing table: public.courses");
});

it("fails when a foreign-key relationship is orphaned", async () => {
  const database = await freshDatabase();
  await seedSyntheticOwner(database.pool);
  await database.pool.query('ALTER TABLE "dogs" DROP CONSTRAINT "dogs_owner_id_user_id_fk"');
  await insertOrphanDog(database.pool); // owner_id = a random, non-existent user id
  const report = await verifyRestore(database.pool);
  expect(report.ok).toBe(false);
  expect(report.failures).toContain("orphan rows: dogs_without_owner=1");
});

it("ignores transient rate_limit rows when judging meaningful data", async () => {
  const database = await freshDatabase();
  await seedSyntheticOwner(database.pool);
  const report = await verifyRestore(database.pool);
  expect(report.snapshot.tables.rate_limit).toEqual({ exists: true, rows: 0 });
  expect(report.failures).toEqual([]);
});

it("flags critical-count differences against a source baseline for operator review", async () => {
  const database = await freshDatabase();
  await seedSyntheticOwner(database.pool);
  const baseline = await captureRecoverySnapshot(database.pool);
  await seedSyntheticOwner(database.pool); // simulate writes after the backup point

  const report = await verifyRestore(database.pool, { baseline });

  expect(report.ok).toBe(true);
  expect(report.requiresOperatorReview).toBe(true);
  expect(report.comparison?.critical).toContainEqual(
    expect.objectContaining({ table: "dogs", source: 1, restore: 2, delta: 1 }),
  );
  expect(report.warnings.join("\n")).toMatch(/operator review/);
});
```

Write `seedSyntheticOwner` and `insertOrphanDog` in the same test file using
`drizzle(database.pool, { schema })` and the committed Drizzle schema, so the
fixtures stay in sync with column requirements. Seed sentinel values
(`"Synthetic Owner"`, `"private journal sentinel"`) that must never appear in the
report. Give the suite a generous per-test timeout (`{ timeout: 120_000 }`)
because each case creates and migrates a database.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/recovery/verify-restore.test.ts
```

Expected: FAIL because the verifier is missing.

- [ ] **Step 3: Implement the report types, table lists, and journal expectations**

Create `apps/api/src/recovery/verify-restore.ts`:

```ts
import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";

const REQUIRED_TABLES = [
  "user",
  "session",
  "account",
  "verification",
  "dogs",
  "behavior_concerns",
  "training_goals",
  "training_skills",
  "practice_sessions",
  "skill_milestones",
  "weekly_focus",
  "journal_entries",
  "briefs",
  "brief_sends",
  "trainers",
  "courses",
  "rate_limit",
  "events",
] as const;

/**
 * Tables whose emptiness proves the restore did not actually recover owner
 * data. `rate_limit` is deliberately excluded: Better Auth rewrites and expires
 * those rows continuously, so its contents carry no recovery meaning — only its
 * schema presence does, which REQUIRED_TABLES already covers.
 */
const MEANINGFUL_TABLES = ["user", "dogs"] as const;

/** Compared side-by-side against the pre-restore source baseline. */
const CRITICAL_TABLES = [
  "user",
  "session",
  "account",
  "dogs",
  "behavior_concerns",
  "training_goals",
  "training_skills",
  "practice_sessions",
  "skill_milestones",
  "weekly_focus",
  "journal_entries",
  "briefs",
  "brief_sends",
  "trainers",
  "courses",
  "events",
] as const;

export type TableName = (typeof REQUIRED_TABLES)[number];

export type RecoverySnapshot = {
  capturedAt: string;
  databaseVersion: string;
  migrations: { ledgerPresent: boolean; applied: number; latestAppliedAt: number | null };
  tables: Record<TableName, { exists: boolean; rows: number | null }>;
  invalidConstraints: number;
  orphans: Record<string, number>;
};

export type ExpectedMigrations = {
  count: number;
  latestTag: string;
  latestWhen: number;
  /** Committed journal entries, oldest first. Used to detect backup lag. */
  entries: Array<{ tag: string; when: number }>;
};

/**
 * A restore whose ledger is a leading subset of the committed journal is a
 * backup taken before the newest migration deployed — self-consistent, not
 * corrupt. It is reported here for explicit operator review instead of failing.
 */
export type MigrationLag = {
  applied: number;
  expected: number;
  missing: string[];
  latestAppliedTag: string;
  latestAppliedAt: number;
  behindByMs: number;
};

export type RestoreReport = {
  checkedAt: string;
  ok: boolean;
  requiresOperatorReview: boolean;
  expectedMigrations: ExpectedMigrations;
  snapshot: RecoverySnapshot;
  migrationLag?: MigrationLag;
  comparison?: {
    baselineCapturedAt: string;
    critical: Array<{
      table: TableName;
      source: number | null;
      restore: number | null;
      delta: number | null;
    }>;
  };
  failures: string[];
  warnings: string[];
};

const JOURNAL_URL = new URL("../../drizzle/meta/_journal.json", import.meta.url);

export async function readExpectedMigrations(): Promise<ExpectedMigrations> {
  const journal = JSON.parse(await readFile(JOURNAL_URL, "utf-8")) as {
    entries: Array<{ idx: number; when: number; tag: string }>;
  };
  const entries = [...journal.entries]
    .sort((a, b) => a.when - b.when)
    .map(({ tag, when }) => ({ tag, when }));
  const latest = entries.at(-1);
  if (!latest) throw new Error("no committed migrations found in drizzle/meta/_journal.json");
  return { count: entries.length, latestTag: latest.tag, latestWhen: latest.when, entries };
}
```

Never select names, emails, notes, summaries, tokens, IP addresses, user agents,
or any other row value — only counts and metadata.

- [ ] **Step 4: Implement snapshot collection**

Run every query inside a read-only transaction so the same code can safely be
pointed at production for the baseline capture:

```ts
async function withReadOnlyClient<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function captureRecoverySnapshot(pool: Pool): Promise<RecoverySnapshot> { /* … */ }
```

Inside, use parameterized metadata queries for table existence and count rows
only after validating the identifier against `REQUIRED_TABLES`; table identifiers
cannot be SQL parameters. Quote the validated identifier so the reserved table
name `user` works:

```ts
for (const table of REQUIRED_TABLES) {
  const existsResult = await client.query<{ exists: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS exists",
    [`public.${table}`],
  );
  const exists = existsResult.rows[0]?.exists === true;
  let rows: number | null = null;
  if (exists) {
    const counted = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM "${table}"`,
    );
    // `noUncheckedIndexedAccess` is on: row 0 is `T | undefined`, so read it
    // optionally instead of asserting.
    rows = counted.rows[0]?.count ?? null;
  }
  tables[table] = { exists, rows };
}
```

Migration ledger:

```sql
SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present
```

```sql
SELECT count(*)::int AS applied, max(created_at)::float8 AS latest
FROM drizzle."__drizzle_migrations"
```

`created_at` in that ledger is the migration's `folderMillis`, which is exactly
the `when` value in `drizzle/meta/_journal.json`, so the two are directly
comparable — but only after the type is right. The column is `bigint`, and
`node-postgres` parses `int8` as a **string**, so `max(created_at)` would arrive
as `"1747420000000"` and never `===` a journal number. Cast to `float8`, which
`node-postgres` parses as a number and which represents every millisecond
timestamp exactly (far below 2^53); `Number(row.latest)` is the equivalent fix if
the cast is dropped. Read both values optionally:

```ts
const ledger = await client.query<{ applied: number; latest: number | null }>(
  'SELECT count(*)::int AS applied, max(created_at)::float8 AS latest FROM drizzle."__drizzle_migrations"',
);
const migrations = {
  ledgerPresent: true,
  applied: ledger.rows[0]?.applied ?? 0,
  latestAppliedAt: ledger.rows[0]?.latest ?? null,
};
```

Constraint query:

```sql
SELECT count(*)::int AS count
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND NOT convalidated
```

Orphan query:

```sql
SELECT
  (SELECT count(*)::int FROM dogs d LEFT JOIN "user" u ON u.id = d.owner_id WHERE u.id IS NULL)
    AS dogs_without_owner,
  (SELECT count(*)::int FROM behavior_concerns c LEFT JOIN dogs d ON d.id = c.dog_id WHERE d.id IS NULL)
    AS concerns_without_dog,
  (SELECT count(*)::int FROM training_goals g LEFT JOIN dogs d ON d.id = g.dog_id WHERE d.id IS NULL)
    AS goals_without_dog,
  (SELECT count(*)::int FROM training_skills s LEFT JOIN training_goals g ON g.id = s.goal_id WHERE g.id IS NULL)
    AS skills_without_goal,
  (SELECT count(*)::int FROM practice_sessions p LEFT JOIN training_skills s ON s.id = p.skill_id WHERE s.id IS NULL)
    AS practice_without_skill,
  (SELECT count(*)::int FROM skill_milestones m LEFT JOIN training_skills s ON s.id = m.skill_id WHERE s.id IS NULL)
    AS milestones_without_skill,
  (SELECT count(*)::int FROM weekly_focus w LEFT JOIN dogs d ON d.id = w.dog_id WHERE d.id IS NULL)
    AS weekly_focus_without_dog,
  (SELECT count(*)::int FROM weekly_focus w LEFT JOIN training_skills s ON s.id = w.skill_id WHERE s.id IS NULL)
    AS weekly_focus_without_skill,
  (SELECT count(*)::int FROM journal_entries j LEFT JOIN dogs d ON d.id = j.dog_id WHERE d.id IS NULL)
    AS journal_entries_without_dog,
  (SELECT count(*)::int FROM briefs b LEFT JOIN dogs d ON d.id = b.dog_id WHERE d.id IS NULL)
    AS briefs_without_dog,
  (SELECT count(*)::int FROM brief_sends s LEFT JOIN briefs b ON b.id = s.brief_id WHERE b.id IS NULL)
    AS brief_sends_without_brief
```

Skip the orphan query and record the reason in `failures` when any table it
references is missing, so an unmigrated clone reports missing tables instead of
throwing.

- [ ] **Step 5: Implement verification rules**

```ts
export async function verifyRestore(
  pool: Pool,
  options: { baseline?: RecoverySnapshot } = {},
): Promise<RestoreReport> { /* … */ }
```

Add a failure for each of:

- a required table is absent → `missing table: public.<name>`;
- the migration ledger is absent → `missing migration ledger: drizzle.__drizzle_migrations`;
- a `MEANINGFUL_TABLES` count is 0 → `no rows restored: <name>`;
- `invalidConstraints > 0`;
- any orphan count > 0 → `orphan rows: <check>=<count>`.

Classify the migration state in three ways rather than two, because a backup can
legitimately predate the repository's newest migration. Run this classification
only when the ledger is present; an absent ledger already failed above with
`missing migration ledger: drizzle.__drizzle_migrations`:

```ts
const { applied, latestAppliedAt } = snapshot.migrations;
const expectedAtApplied = expected.entries[applied - 1];

if (applied === expected.count && latestAppliedAt === expected.latestWhen) {
  // Exact match: nothing to report.
} else if (
  applied > 0 &&
  applied < expected.count &&
  expectedAtApplied &&
  latestAppliedAt === expectedAtApplied.when
) {
  // The ledger is a leading subset of the committed journal: the backup was
  // taken before the newest migration deployed. Self-consistent, so not a
  // failure — but never silently accepted either.
  const missing = expected.entries.slice(applied).map((entry) => entry.tag);
  migrationLag = {
    applied,
    expected: expected.count,
    missing,
    latestAppliedTag: expectedAtApplied.tag,
    latestAppliedAt: expectedAtApplied.when,
    behindByMs: expected.latestWhen - expectedAtApplied.when,
  };
  requiresOperatorReview = true;
  warnings.push(
    `migration lag needs operator review: applied=${applied} expected=${expected.count} ` +
      `missing=${missing.join(", ")} behindBy=${migrationLag.behindByMs}ms`,
  );
} else {
  // Ahead of, or inconsistent with, the committed journal.
  if (applied !== expected.count) {
    failures.push(`migration count mismatch: applied=${applied} expected=${expected.count}`);
  }
  if (latestAppliedAt !== expected.latestWhen) {
    failures.push(`latest migration mismatch: expected ${expected.latestTag}`);
  }
}
```

`ok` is `failures.length === 0`. A restored clone that is empty, unmigrated, or
inconsistent with the committed journal therefore cannot pass, while a clone that
is simply *behind* passes with `requiresOperatorReview = true` and an explicit
delta the operator must sign off on. Set `migrationLag` only in the lag branch so
`report.migrationLag` is `undefined` for both an exact match and a failure.

When `options.baseline` is supplied, build `comparison.critical` from
`CRITICAL_TABLES` with `delta = restore - source`, set
`requiresOperatorReview = true` if any delta is non-zero, and push one warning
per differing table:

```
critical count differs and needs operator review: dogs source=41 restore=40 delta=-1
```

Do **not** apply an automated tolerance. A smaller restored count is the normal
consequence of backup lag, and a larger restored count is the normal consequence
of deletions after the recovery point; neither can be distinguished from real
data loss by a threshold, so the operator must review the deltas against the
recorded backup lag and sign off in the drill evidence record. `rate_limit` is
excluded from `CRITICAL_TABLES` because Better Auth continuously rewrites it.
Count deltas and migration lag are independent: either alone sets
`requiresOperatorReview`.

- [ ] **Step 6: Add the CLI boundaries**

`verify-restore.ts` stays a pure library with no side effects on import. The
runnable entrypoint is a separate file, matching the existing
`src/telemetry/retention-cli.ts` convention. Create
`apps/api/src/recovery/verify-restore-cli.ts`:

```ts
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { type RecoverySnapshot, verifyRestore } from "./verify-restore";

// Runnable entrypoint for the isolated restore drill. Never point this at
// production: the guards below refuse the live and source databases.
async function main() {
  const url = process.env.RESTORE_DATABASE_URL;
  if (!url) throw new Error("RESTORE_DATABASE_URL is required");
  if (process.env.CONFIRM_ISOLATED_RESTORE !== "yes") {
    throw new Error("CONFIRM_ISOLATED_RESTORE=yes is required");
  }
  if (process.env.DATABASE_URL && url === process.env.DATABASE_URL) {
    throw new Error("RESTORE_DATABASE_URL must not be the live DATABASE_URL");
  }
  // The drill shell exports SOURCE_DATABASE_URL for the baseline capture, so
  // guard against re-using the production pooler URL as the "restore" target.
  if (process.env.SOURCE_DATABASE_URL && url === process.env.SOURCE_DATABASE_URL) {
    throw new Error("RESTORE_DATABASE_URL must not be the SOURCE_DATABASE_URL");
  }
  const baselinePath = process.env.BASELINE_SNAPSHOT_PATH;
  const baseline = baselinePath
    ? (JSON.parse(await readFile(baselinePath, "utf-8")) as RecoverySnapshot)
    : undefined;
  // Same managed-Postgres TLS rule as src/db/index.ts and drizzle.config.ts.
  const pool = new Pool({
    connectionString: url,
    ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  try {
    const report = await verifyRestore(pool, { baseline });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (report.requiresOperatorReview) {
      process.stderr.write(
        "REVIEW REQUIRED: migration lag and/or critical counts differ from the source baseline\n",
      );
    }
    if (!report.ok) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[recovery] verification failed:", err);
  process.exit(1);
});
```

The `main()` / `main().catch(...)` shape and the "runnable entrypoint" comment
mirror `src/telemetry/retention-cli.ts`, the repository's existing CLI
convention. Because the entrypoint is its own module, no ESM main-module guard
is needed: `verify-restore.test.ts` imports `verify-restore.ts` only, and that
module never runs the CLI.

Create `apps/api/src/recovery/capture-baseline.ts` for the pre-restore source
capture. It requires an explicit `SOURCE_DATABASE_URL` and
`CONFIRM_READ_ONLY_BASELINE=yes`, calls `captureRecoverySnapshot` (which runs in
a `BEGIN READ ONLY` transaction, so it cannot write to production), and writes
the snapshot JSON to stdout. It captures counts and metadata only — no row
values, no connection string, no identifiers. It builds its pool with the same
managed-Postgres TLS rule as `src/db/index.ts`, `drizzle.config.ts`, and
`verify-restore-cli.ts` — without it the Supabase pooler connection fails and the
drill cannot even start:

```ts
const url = process.env.SOURCE_DATABASE_URL;
if (!url) throw new Error("SOURCE_DATABASE_URL is required");
if (process.env.CONFIRM_READ_ONLY_BASELINE !== "yes") {
  throw new Error("CONFIRM_READ_ONLY_BASELINE=yes is required");
}
// Local Docker Postgres speaks plaintext; managed Postgres (Supabase) requires
// TLS with rejectUnauthorized:false, exactly as src/db/index.ts documents.
const pool = new Pool({
  connectionString: url,
  ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url) ? undefined : { rejectUnauthorized: false },
});
```

Add to `apps/api/package.json`, next to the existing `telemetry:purge` entry:

```json
"recovery:baseline": "tsx src/recovery/capture-baseline.ts",
"recovery:verify": "tsx src/recovery/verify-restore-cli.ts"
```

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
pnpm --filter @turingcare/api exec vitest run src/recovery/verify-restore.test.ts
pnpm --filter @turingcare/api typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/recovery apps/api/package.json
git commit -m "feat(api): add isolated restore verifier"
```

### Task 3: Write the production recovery and drill runbook

**Files:**
- Create: `docs/runbooks/database-recovery.md`
- Create: `docs/runbooks/templates/restore-drill-evidence.md`
- Modify: `DEPLOY.md`
- Modify: `README.md`
- Modify: `docs/SECURITY-BACKLOG.md`

- [ ] **Step 1: Document the backup capability gate**

The runbook must require the operator to verify before declaring readiness:

```text
Source project plan: paid
Backup mode: physical daily backups or PITR
Restore to a New Project tab: available
Latest successful backup/recovery point: recorded in UTC
Retention window: recorded
Target RPO: <= 24 hours with daily backups; <= 2 minutes with PITR
Database owner: named operational role, not a personal credential in the repo
```

State explicitly that Free-plan logical dumps do not satisfy this drill because
they do not prove provider-managed backup recovery.

- [ ] **Step 2: Document incident restoration decision rules**

Add:

1. Stop writes by placing the API in maintenance mode or scaling Fly to zero only
   when an actual production restore is authorized.
2. Record incident start and last known-good timestamp in UTC.
3. Prefer PITR to the latest safe point; otherwise select the newest daily backup
   before corruption.
4. Never test by restoring over production.
5. For the drill, use Supabase **Database → Backups → Restore to a New Project**.
6. Production remains online and unchanged during the drill.

Clarify that Supabase Storage objects are outside scope because TuringCare
currently stores application records in Postgres and does not rely on Storage
objects. If Storage is introduced later, this runbook must gain a separate
object-backup procedure.

- [ ] **Step 3: Document isolated project controls**

Immediately after the clone completes:

```sql
ALTER DATABASE postgres SET default_transaction_read_only = on;
```

Then disable external-capable extensions/jobs if present:

```sql
SELECT extname FROM pg_extension
WHERE extname IN ('pg_net', 'pg_cron', 'wrappers');
```

Do not connect Fly, Cloudflare, Resend, webhooks, Edge Functions, Realtime
consumers, or application secrets to the clone. Do not send email from the clone.
Restrict network access to the operator before querying.

The verifier only ever reads, and wraps its queries in `BEGIN READ ONLY`; if the
provided role cannot set `default_transaction_read_only`, set
`PGOPTIONS='-c default_transaction_read_only=on'` for the verification command as
belt-and-braces.

- [ ] **Step 4: Document the exact drill**

Use UTC timestamps throughout and an operator-private evidence directory outside
the repository and outside world-readable temp space:

```bash
export DRILL_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export DRILL_DIR="$HOME/turingcare-ops/restore-drill-$(date -u +%Y%m%d)"
mkdir -p "$DRILL_DIR" && chmod 700 "$DRILL_DIR"
```

1. Record the chosen backup/recovery timestamp from Supabase.
2. **Capture the source baseline before the restore.** With the production
   Session-pooler URL in a shell variable only:

```bash
read -s SOURCE_DATABASE_URL
export SOURCE_DATABASE_URL
export CONFIRM_READ_ONLY_BASELINE=yes
pnpm --silent --filter @turingcare/api recovery:baseline > "$DRILL_DIR/source-baseline.json"
unset CONFIRM_READ_ONLY_BASELINE
```

`--silent` is required: without it pnpm's lifecycle banner is written to stdout
and corrupts the JSON file. `SOURCE_DATABASE_URL` stays exported on purpose
until cleanup: the verifier refuses to run when `RESTORE_DATABASE_URL` equals it,
which is the guard against pasting the production pooler string into the restore
step. The baseline contains aggregate counts, schema presence, migration ledger
totals, and integrity totals only — no owner content, no identifiers, no
connection string.

3. Start **Restore to a New Project** and name the target
   `turingcare-restore-drill-YYYYMMDD`.
4. Record restore completion when the project reports healthy.
5. Copy the temporary project's Session pooler connection string into a shell
   variable only, and verify against the baseline:

```bash
read -s RESTORE_DATABASE_URL
export RESTORE_DATABASE_URL
export CONFIRM_ISOLATED_RESTORE=yes
export BASELINE_SNAPSHOT_PATH="$DRILL_DIR/source-baseline.json"
pnpm --silent --filter @turingcare/api recovery:verify \
  > "$DRILL_DIR/restore-report-$(date -u +%Y%m%dT%H%M%SZ).json"
```

6. Inspect the JSON report. It may contain only timestamps, version, table
   names, counts, migration totals, committed migration tags and their journal
   timestamps, integrity totals, comparison deltas, migration-lag details, and
   failure/warning descriptions. `ok` must be `true`:
   - every required table present;
   - the migration ledger is consistent with the committed
     `drizzle/meta/_journal.json` — either an exact match, or a leading subset
     reported as `migrationLag` (see step 7);
   - `user` and `dogs` row counts are non-zero (an empty clone is a failed
     restore, not a passing one);
   - no invalid constraints and no orphan rows.
7. **Operator review of migration lag.** If the report contains `migrationLag`,
   the backup predates the repository's newest migration. That is expected when
   a migration deployed after the selected recovery point, and it is *not*
   corruption. Record `applied`, `expected`, `missing`, and `behindByMs` in the
   evidence record, then either:
   - accept the lag and note that the clone reflects the schema at the recovery
     point; or
   - bring the clone forward and re-verify, which also rehearses the real
     recovery sequence:

```bash
DATABASE_URL="$RESTORE_DATABASE_URL" pnpm --filter @turingcare/api db:migrate
pnpm --silent --filter @turingcare/api recovery:verify \
  > "$DRILL_DIR/restore-report-postmigrate-$(date -u +%Y%m%dT%H%M%SZ).json"
```

The second report must have no `migrationLag` and `ok: true`. Migrating the
clone is a write, so run it only after the read-only verification above and only
against the temporary project — never with the production `DATABASE_URL`
exported. If the clone was set to `default_transaction_read_only = on`, turn
that off for the migration and back on afterwards. A `migrationLag` that
`db:migrate` cannot resolve, or a ledger the verifier rejects outright, is a
failed drill.

8. **Operator review of the comparison.** If `requiresOperatorReview` is `true`
   because of count deltas, review every critical-count delta against the
   measured backup lag and record a written judgement in the evidence record. A
   small negative delta on append-mostly tables (`journal_entries`,
   `practice_sessions`, `events`) is the expected consequence of backup lag; a
   positive delta means rows were deleted after the recovery point. Anything that
   cannot be explained by the recorded lag is a failed drill and gets a
   `production` issue. There is deliberately no automated tolerance — no
   threshold can distinguish backup lag from real data loss.
9. Record:

```text
RPO = drill start UTC - selected recovery point UTC
RTO = verifier success UTC - restore request UTC
```

10. Delete the temporary Supabase project immediately after evidence is recorded.
11. Confirm the project no longer appears in the dashboard and that its
    connection string no longer accepts connections.
12. Unset and remove temporary secrets/files:

```bash
unset RESTORE_DATABASE_URL SOURCE_DATABASE_URL CONFIRM_ISOLATED_RESTORE BASELINE_SNAPSHOT_PATH
rm "$DRILL_DIR/source-baseline.json" "$DRILL_DIR/restore-report-<exact timestamp>.json"
```

Use the exact resolved filenames; do not use recursive deletion or wildcards.
Remove the post-migration report too if step 7 produced one. Only the
transcribed, non-sensitive evidence record survives the drill.

- [ ] **Step 5: Add the evidence template**

Create `docs/runbooks/templates/restore-drill-evidence.md`:

```markdown
# TuringCare Restore Drill Evidence

- Drill date (UTC):
- Operator role:
- Source Supabase project ref (last 6 characters only):
- Backup mode: daily physical / PITR
- Selected recovery point (UTC):
- Source baseline captured (UTC):
- Restore requested (UTC):
- Restore healthy (UTC):
- Verification passed (UTC):
- Measured RPO:
- Measured RTO:
- Required tables present: yes/no
- Applied migrations match committed journal: yes/no (expected count / latest tag)
- Migration lag reported: yes/no (applied / expected / missing tags / behind by)
- Migration lag resolution: accepted as-is / db:migrate applied and re-verified
- Meaningful data restored (user > 0, dogs > 0): yes/no
- Invalid constraints: 0 / other
- Orphan checks: all zero / failure
- Critical counts compared to source baseline: yes/no
- Operator review of deltas required: yes/no
- Delta judgement (explained by backup lag? which tables? decision):
- External side effects disabled: yes/no
- Temporary project deleted (UTC):
- Deletion confirmed by failed connection (UTC):
- Baseline and report files removed (UTC):
- Follow-up issue URLs:

Attestation: No owner names, emails, journal text, notes, Brief content,
authentication tokens, or connection strings were copied into this record.
```

- [ ] **Step 6: Update deployment and repository documentation**

Append `## 10. Database recovery readiness` to `DEPLOY.md` (after the monitoring
section added by the other plan, before `## Quick reference`) covering:

- production Supabase must remain on a paid plan with physical backups;
- an operator must check backup freshness weekly during beta;
- run the isolated restore drill before public beta and quarterly thereafter;
- the drill captures a source baseline first, then verifies the clone with
  `pnpm --silent --filter @turingcare/api recovery:verify`;
- a report with `requiresOperatorReview: true` — from count deltas, from a
  `migrationLag` backup taken before the newest migration, or both — needs a
  written operator judgement; it is not an automatic failure;
- evidence belongs in the private operational system, not in the public
  repository;
- database connection strings remain only in Supabase, GitHub/Fly secrets, or an
  operator shell;
- link `docs/runbooks/database-recovery.md`.

In `README.md`, add one line under the existing operational documentation
pointing at `docs/runbooks/database-recovery.md` and stating that recovery
verification runs against a throwaway database locally and never against
production.

In `docs/SECURITY-BACKLOG.md`, add a `## Shipped — Backup restore readiness
(2026-08-10)` section recording: provider-confirmed backup capability, the
isolated drill procedure, the non-sensitive verifier, its migration-lag review
rule, and the measured RPO/RTO outcome (filled in after Task 5).

- [ ] **Step 7: Commit**

```bash
git add docs/runbooks/database-recovery.md docs/runbooks/templates/restore-drill-evidence.md \
  DEPLOY.md README.md docs/SECURITY-BACKLOG.md
git commit -m "docs: add database recovery runbook"
```

### Task 4: Exercise the verifier in CI-safe conditions

**Files:**
- Modify only if the validation reveals a bug.

- [ ] **Step 1: Run the recovery tests against local Postgres**

Run:

```bash
docker compose up -d --wait
pnpm --filter @turingcare/api db:migrate
pnpm --filter @turingcare/api exec vitest run src/recovery
```

Expected: PASS. Every case runs against its own throwaway database; the shared
test database is never counted, mutated, or corrupted.

- [ ] **Step 2: Confirm no throwaway databases leak**

Run:

```bash
docker compose exec -T postgres psql -U postgres -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'turingcare_verify_%'"
```

Expected: empty output.

- [ ] **Step 3: Run the verifier CLI against a disposable local database**

Create a scratch database, migrate it, seed one user and dog through the
application, then run:

```bash
RESTORE_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/turingcare_drill_rehearsal" \
CONFIRM_ISOLATED_RESTORE=yes \
pnpm --silent --filter @turingcare/api recovery:verify
```

Expected: exit 0 and JSON containing only schema names, counts, migration
totals and committed migration tags, version, and integrity totals. Drop the
scratch database afterwards.

- [ ] **Step 4: Verify the safety guards**

Run:

```bash
RESTORE_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/turingcare_drill_rehearsal" \
pnpm --filter @turingcare/api recovery:verify
```

Expected: non-zero exit with `CONFIRM_ISOLATED_RESTORE=yes is required`.

Run:

```bash
export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
RESTORE_DATABASE_URL="$DATABASE_URL" CONFIRM_ISOLATED_RESTORE=yes \
pnpm --filter @turingcare/api recovery:verify
```

Expected: non-zero exit with `RESTORE_DATABASE_URL must not be the live DATABASE_URL`.
The guard depends on the live URL being explicitly exported; the recovery CLI
intentionally does not load the application `.env`.

Run:

```bash
SOURCE_DATABASE_URL="$DATABASE_URL" RESTORE_DATABASE_URL="$DATABASE_URL" \
CONFIRM_ISOLATED_RESTORE=yes \
pnpm --filter @turingcare/api recovery:verify
```

Expected: non-zero exit with `RESTORE_DATABASE_URL must not be the SOURCE_DATABASE_URL`
once `DATABASE_URL` is unset, and with the live-`DATABASE_URL` message while it is
set — both guards are independent, and the drill shell keeps
`SOURCE_DATABASE_URL` exported precisely so the second one can fire.

- [ ] **Step 5: Prove an empty clone fails**

Create an empty, unmigrated scratch database and point the verifier at it.

Expected: non-zero exit, `ok: false`, and failures naming the missing migration
ledger and missing tables. Drop the scratch database afterwards.

- [ ] **Step 6: Prove a lagging clone is reviewed, not failed**

Create a scratch database, migrate it, seed one user and one dog, then delete the
newest row from `drizzle."__drizzle_migrations"` and run the CLI.

Expected: exit 0, `ok: true`, `requiresOperatorReview: true`, a `migrationLag`
object naming the missing migration tag, and the
`REVIEW REQUIRED: migration lag and/or critical counts differ from the source baseline`
line on stderr. Drop the scratch database afterwards.

- [ ] **Step 7: Run repository validation**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: PASS.

- [ ] **Step 8: Commit any validation-only corrections**

```bash
git add apps/api/src/recovery
git commit -m "fix(api): correct restore verifier findings"
```

Skip this commit if no files changed; never use `git add -A`.

### Task 5: Perform and record the real provider restore drill

**Files:**
- No repository changes unless the runbook or verifier proves inaccurate.
- Modify: `docs/PROJECT-LOG.md`
- Modify: `docs/SECURITY-BACKLOG.md` (fill in the measured outcome)

- [ ] **Step 1: Confirm authorization and paid capability**

The operator confirms the temporary project's displayed cost and has
authorization to create and delete it. Stop if “Restore to a New Project” is
unavailable; readiness is blocked until the Supabase plan/backup mode supports
it.

- [ ] **Step 2: Capture the source baseline**

Run `recovery:baseline` against production exactly as documented in Task 3,
Step 4.2, and store the JSON in the operator-private drill directory. Production
stays online; the capture is a read-only transaction.

- [ ] **Step 3: Execute the runbook without production downtime**

Restore the newest eligible production backup into the named temporary project,
disable side effects, and run `recovery:verify` with `BASELINE_SNAPSHOT_PATH`
set.

Expected: report `ok: true`, all required tables present, a migration ledger that
either matches the committed journal or is reported as `migrationLag`, non-zero
`user` and `dogs` counts, no invalid constraints, all orphan checks zero.

- [ ] **Step 4: Review migration lag and the count comparison**

If the report contains `migrationLag`, record `applied`, `expected`, `missing`,
and `behindByMs`, then follow Task 3, Step 4.7 — either accept the lag with a
written note or apply `db:migrate` to the isolated clone and re-run the verifier,
attaching both reports' outcomes to the evidence record. A backup that is behind
the repository is not a failed drill.

Record every non-zero critical delta and the written judgement described in
Task 3, Step 4.8. Deltas explained by the measured backup lag pass with an
operator note; anything else fails the drill and opens a `production` issue with
the measured values only — never database content.

- [ ] **Step 5: Measure service objectives**

Calculate and record actual RPO and RTO. Compare with:

- Daily backup target: RPO no more than 24 hours.
- PITR target: RPO no more than 2 minutes when database writes occurred recently.
- Initial beta RTO target: no more than 4 hours.

Open a `production` issue for any miss, including the measured value and
remediation owner, but no database content.

- [ ] **Step 6: Destroy the restored project**

Delete the temporary project, confirm the connection fails, remove the baseline
and report JSON files, unset shell variables, and record deletion UTC.

- [ ] **Step 7: Review and record evidence**

Expected evidence contains timings, project suffix, aggregate validation status,
delta judgement, and deletion confirmation only. It must not contain connection
strings, user identity, owner-authored content, tokens, or raw SQL query
results.

Fill in the measured RPO/RTO in `docs/SECURITY-BACKLOG.md` and append a
`## 2026-08-10 — Backup restore readiness — SHIPPED` entry to
`docs/PROJECT-LOG.md` in the existing format: what changed, gates run, spec/plan
links (`docs/superpowers/specs/2026-08-10-production-operational-readiness-design.md`,
`docs/superpowers/plans/2026-08-10-backup-restore-readiness.md`), and the commit
range. Record measured RPO/RTO and the drill date; include no owner data.

- [ ] **Step 8: Commit**

```bash
git add docs/PROJECT-LOG.md docs/SECURITY-BACKLOG.md
git commit -m "docs: log restore drill results"
```
