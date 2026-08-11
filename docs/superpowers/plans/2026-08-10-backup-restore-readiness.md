# Backup Restore Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that TuringCare's Supabase production database can be restored into an isolated temporary project, validated without exposing owner content, measured for RPO/RTO, and securely destroyed.

**Architecture:** Supabase's paid-plan “Restore to a New Project” capability is the primary recovery mechanism because it clones an actual provider-managed physical backup without taking production offline. A repository script connects only to the temporary restore, verifies the expected schema, aggregate row counts, constraints, and referential integrity, and emits JSON evidence containing no owner-authored values. A runbook controls access, disables external side effects, records the drill timeline, and requires deletion confirmation.

**Tech Stack:** Supabase physical backups, Supabase Dashboard/Management API, PostgreSQL 17 client tools, Node 22, TypeScript, `pg`, Vitest.

---

## File map

- Create `apps/api/src/recovery/verify-restore.ts`: schema/count/integrity verifier with JSON output.
- Create `apps/api/src/recovery/verify-restore.test.ts`: verifier tests against a disposable Postgres database.
- Modify `apps/api/package.json`: `recovery:verify` command.
- Create `docs/runbooks/database-recovery.md`: production incident and isolated drill procedure.
- Create `docs/runbooks/templates/restore-drill-evidence.md`: non-sensitive evidence record.
- Modify `DEPLOY.md`: backup capability prerequisites and operator ownership.

### Task 1: Build the non-sensitive restore verifier

**Files:**
- Create: `apps/api/src/recovery/verify-restore.ts`
- Create: `apps/api/src/recovery/verify-restore.test.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Write the failing schema and aggregate test**

The test uses the existing Postgres test database, applies Drizzle migrations first, inserts only synthetic fixtures, and invokes an exported `verifyRestore(pool)` function:

```ts
it("reports schema, aggregate counts, and integrity without row content", async () => {
  const report = await verifyRestore(pool);
  expect(report.ok).toBe(true);
  expect(report.tables.user).toEqual({ exists: true, rows: 1 });
  expect(report.tables.dogs).toEqual({ exists: true, rows: 1 });
  expect(report.orphans).toEqual(expect.objectContaining({
    dogs_without_owner: 0,
    journal_entries_without_dog: 0,
    briefs_without_dog: 0,
  }));
  expect(JSON.stringify(report)).not.toContain("Synthetic Owner");
  expect(JSON.stringify(report)).not.toContain("private journal sentinel");
});
```

Add failure cases:

```ts
it("fails when a required table is absent", async () => {
  // Run against a temporary schema with dogs omitted.
  expect(report.ok).toBe(false);
  expect(report.failures).toContain("missing table: public.dogs");
});

it("fails when a foreign-key relationship is orphaned", async () => {
  // Disable triggers in the disposable DB, insert one orphan, re-enable triggers.
  expect(report.failures).toContain("orphan rows: dogs_without_owner=1");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @turingcare/api test -- src/recovery/verify-restore.test.ts
```

Expected: FAIL because the verifier is missing.

- [ ] **Step 3: Implement the report types and required table list**

Create `verify-restore.ts` with:

```ts
import { Pool } from "pg";

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

type TableName = (typeof REQUIRED_TABLES)[number];
type RestoreReport = {
  checkedAt: string;
  databaseVersion: string;
  ok: boolean;
  tables: Record<TableName, { exists: boolean; rows: number | null }>;
  invalidConstraints: number;
  orphans: Record<string, number>;
  failures: string[];
};
```

Do not select names, emails, notes, summaries, tokens, IP addresses, user agents, or any row values.

- [ ] **Step 4: Implement table, constraint, and orphan checks**

Use parameterized metadata queries for table existence. Count rows only after
validating the table name against `REQUIRED_TABLES`; table identifiers cannot be
SQL parameters. Quote the validated identifier so the reserved table name
`user` works:

```ts
for (const table of REQUIRED_TABLES) {
  const existsResult = await pool.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${table}`],
  );
  const exists = existsResult.rows[0]?.exists === true;
  const rows = exists
    ? Number(
        (await pool.query<{ count: string }>(`SELECT count(*) AS count FROM "${table}"`))
          .rows[0].count,
      )
    : null;
  tables[table] = { exists, rows };
}
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

Set `ok` only when every required table exists, all counts complete, `invalidConstraints === 0`, and every orphan count is zero.

- [ ] **Step 5: Add the CLI boundary**

At the bottom:

```ts
async function main() {
  const url = process.env.RESTORE_DATABASE_URL;
  if (!url) throw new Error("RESTORE_DATABASE_URL is required");
  if (process.env.CONFIRM_ISOLATED_RESTORE !== "yes") {
    throw new Error("CONFIRM_ISOLATED_RESTORE=yes is required");
  }
  const pool = new Pool({
    connectionString: url,
    ssl: /@(localhost|127\.0\.0\.1)[:/]/.test(url)
      ? undefined
      : { rejectUnauthorized: false },
  });
  try {
    const report = await verifyRestore(pool);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.ok) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
```

Use an ESM main-module guard so imports in tests do not execute the CLI.

Add:

```json
"recovery:verify": "tsx src/recovery/verify-restore.ts"
```

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
pnpm --filter @turingcare/api test -- src/recovery/verify-restore.test.ts
pnpm --filter @turingcare/api typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/recovery apps/api/package.json
git commit -m "feat(api): add isolated restore verifier"
```

### Task 2: Write the production recovery and drill runbook

**Files:**
- Create: `docs/runbooks/database-recovery.md`
- Create: `docs/runbooks/templates/restore-drill-evidence.md`
- Modify: `DEPLOY.md`

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

State explicitly that Free-plan logical dumps do not satisfy this drill because they do not prove provider-managed backup recovery.

- [ ] **Step 2: Document incident restoration decision rules**

Add:

1. Stop writes by placing the API in maintenance mode or scaling Fly to zero only when an actual production restore is authorized.
2. Record incident start and last known-good timestamp in UTC.
3. Prefer PITR to the latest safe point; otherwise select the newest daily backup before corruption.
4. Never test by restoring over production.
5. For the drill, use Supabase **Database → Backups → Restore to a New Project**.
6. Production remains online and unchanged during the drill.

Clarify that Supabase Storage objects are outside scope because TuringCare currently stores application records in Postgres and does not rely on Storage objects. If Storage is introduced later, this runbook must gain a separate object-backup procedure.

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

Do not connect Fly, Cloudflare, Resend, webhooks, Edge Functions, Realtime consumers, or application secrets to the clone. Do not send email from the clone. Restrict network access to the operator before querying.

The verifier needs read-only access; if `default_transaction_read_only` cannot be set by the provided role, set `PGOPTIONS='-c default_transaction_read_only=on'` for the verification command.

- [ ] **Step 4: Document the exact drill**

Use UTC timestamps throughout:

```bash
export DRILL_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

1. Record the chosen backup/recovery timestamp from Supabase.
2. Start **Restore to a New Project** and name the target `turingcare-restore-drill-YYYYMMDD`.
3. Record restore completion when the project reports healthy.
4. Copy the temporary project's Session pooler connection string into a shell variable only:

```bash
read -s RESTORE_DATABASE_URL
export RESTORE_DATABASE_URL
export CONFIRM_ISOLATED_RESTORE=yes
pnpm --filter @turingcare/api recovery:verify \
  > "/tmp/turingcare-restore-report-$(date -u +%Y%m%dT%H%M%SZ).json"
```

5. Inspect the JSON report. It may contain only timestamps, version, table names, counts, integrity totals, and failure descriptions.
6. Record:

```text
RPO = drill start UTC - selected recovery point UTC
RTO = verifier success UTC - restore request UTC
```

7. Delete the temporary Supabase project immediately after evidence is recorded.
8. Confirm the project no longer appears in the dashboard and its connection string no longer accepts connections.
9. Unset and remove temporary secrets/files:

```bash
unset RESTORE_DATABASE_URL CONFIRM_ISOLATED_RESTORE
rm "/tmp/turingcare-restore-report-<exact timestamp>.json"
```

Use the exact resolved filename; do not use recursive deletion or wildcards.

- [ ] **Step 5: Add the evidence template**

Create:

```markdown
# TuringCare Restore Drill Evidence

- Drill date (UTC):
- Operator role:
- Source Supabase project ref (last 6 characters only):
- Backup mode: daily physical / PITR
- Selected recovery point (UTC):
- Restore requested (UTC):
- Restore healthy (UTC):
- Verification passed (UTC):
- Measured RPO:
- Measured RTO:
- Required tables present: yes/no
- Invalid constraints: 0 / other
- Orphan checks: all zero / failure
- Aggregate counts reviewed: yes/no
- External side effects disabled: yes/no
- Temporary project deleted (UTC):
- Deletion confirmed by failed connection (UTC):
- Follow-up issue URLs:

Attestation: No owner names, emails, journal text, notes, Brief content,
authentication tokens, or connection strings were copied into this record.
```

- [ ] **Step 6: Update deployment documentation**

Add a “Recovery prerequisites” section to `DEPLOY.md`:

- production Supabase must remain on a paid plan with physical backups;
- an operator must check backup freshness weekly during beta;
- run the isolated restore drill before public beta and quarterly thereafter;
- evidence belongs in the private operational system, not in the public repository;
- database connection strings remain only in Supabase, GitHub/Fly secrets, or an operator shell.

- [ ] **Step 7: Commit**

```bash
git add docs/runbooks/database-recovery.md docs/runbooks/templates/restore-drill-evidence.md DEPLOY.md
git commit -m "docs: add database recovery runbook"
```

### Task 3: Exercise the verifier in CI-safe conditions

**Files:**
- Modify only if the validation reveals a bug.

- [ ] **Step 1: Run the recovery tests against Postgres**

Run:

```bash
pnpm --filter @turingcare/api db:migrate
pnpm --filter @turingcare/api test -- src/recovery/verify-restore.test.ts
```

Expected: PASS with the normal test database.

- [ ] **Step 2: Run the verifier against the disposable local test database**

Run:

```bash
RESTORE_DATABASE_URL="$DATABASE_URL" \
CONFIRM_ISOLATED_RESTORE=yes \
pnpm --filter @turingcare/api recovery:verify
```

Expected: exit 0 and JSON containing only schema names, counts, version, and integrity totals.

- [ ] **Step 3: Verify the safety guard**

Run:

```bash
RESTORE_DATABASE_URL="$DATABASE_URL" \
pnpm --filter @turingcare/api recovery:verify
```

Expected: non-zero exit with `CONFIRM_ISOLATED_RESTORE=yes is required`.

- [ ] **Step 4: Run repository validation**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit any validation-only corrections**

```bash
git add -A
git commit -m "test: complete restore readiness gate"
```

Skip this commit if no files changed.

### Task 4: Perform and record the real provider restore drill

**Files:**
- No repository changes unless the runbook or verifier proves inaccurate.

- [ ] **Step 1: Confirm authorization and paid capability**

The operator confirms the temporary project's displayed cost and has authorization to create and delete it. Stop if “Restore to a New Project” is unavailable; readiness is blocked until the Supabase plan/backup mode supports it.

- [ ] **Step 2: Execute the runbook without production downtime**

Restore the newest eligible production backup into the named temporary project, disable side effects, and run `recovery:verify`.

Expected: report `ok: true`, all required tables present, no invalid constraints, all orphan checks zero.

- [ ] **Step 3: Measure service objectives**

Calculate and record actual RPO and RTO. Compare with:

- Daily backup target: RPO no more than 24 hours.
- PITR target: RPO no more than 2 minutes when database writes occurred recently.
- Initial beta RTO target: no more than 4 hours.

Open a `production` issue for any miss, including the measured value and remediation owner, but no database content.

- [ ] **Step 4: Destroy the restored project**

Delete the temporary project, confirm the connection fails, remove the temporary JSON report, unset shell variables, and record deletion UTC.

- [ ] **Step 5: Review evidence**

Expected evidence contains timings, project suffix, aggregate validation status, and deletion confirmation only. It must not contain connection strings, user identity, owner-authored content, tokens, or raw SQL query results.
