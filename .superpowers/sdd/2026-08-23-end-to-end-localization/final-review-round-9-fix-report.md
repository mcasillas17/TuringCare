# Final dual-review round 9 fix report

**Starting commit:** `d3e7744691124da3840a2ffab30649b190bad59c`
**Scope:** The five verified round-9 rollout, migration-lock, Brief lifecycle, send/audit, and
draft-sharing findings only. User-facing documentation remains intentionally deferred until both
reviewers evaluate this commit.

## Findings and implementation

### 1. Rollout-compatible migration protocol

Production deployment now has three explicit, ordered phases:

1. `migrate-compatible` runs `db:migrate:predeploy`, applying pending migrations through 0013.
   This gives the incoming API the locale columns it requires without installing 0014's unique
   Brief-version constraint while legacy read-max writers can still serve traffic.
2. `deploy-api` performs an explicit Fly rolling deployment and completes only after the serving
   machines have been replaced with the dog-locking Brief generator.
3. `migrate` then applies the normal complete migration journal, including 0014.

`migration-rollout.ts` builds a temporary Drizzle migration folder that excludes the named
post-deploy migration. It fails closed if 0014 is missing or ceases to be the latest journal entry,
so a future migration cannot silently inherit an invalid rollout classification. The helper uses
the supported Drizzle migrator rather than editing production migration bookkeeping.

The workflow regression asserts the three dependency edges, predeploy command, explicit rolling
strategy, and ordering. A fresh temporary PostgreSQL database also proved the executable contract:
`db:migrate:predeploy` completed with migration 0013's `briefs.locale` present and 0014's
`briefs_dog_id_version_unique` absent (`t|f`).

### 2. Migration-vs-route deadlock prevention

Migration 0014 now takes an `EXCLUSIVE` table lock on `dogs` before its existing
`SHARE ROW EXCLUSIVE` lock on `briefs`. This follows the runtime dog-to-Brief lock order and creates
a gate before the migration can wait for any Brief row. Existing dog-locking route transactions
drain first; once the migration owns the dog table lock, no new route can acquire its dog row lock
and create the opposing edge of the previous cycle. Reads that do not participate in the lifecycle
remain available.

The regression uses independent PostgreSQL sessions. A route transaction locks a dog and Brief,
the migration is observed waiting on that route's dog lock, the route updates and commits, and the
migration then completes. Against the old 0014 ordering the same test produced PostgreSQL's real
`deadlock detected` error. The test also retains repair assertions: duplicate versions become
`1,2`, while an already-valid `2,4` gap is unchanged. No migration at or below 0013 changed.

### 3. Latest-Brief finalization

Finalization now revalidates ownership while holding the dog lifecycle row lock, selects the latest
Brief `FOR UPDATE`, and updates it with both Brief and dog predicates plus `RETURNING`. A generation
queued first therefore creates the new latest draft before finalization selects it. A deletion
queued first removes the dog and yields the stable 404 instead of a false 200. Missing update output
is never treated as success.

### 4. Send/provider/audit consistency

Brief send now uses the same dog-to-Brief lock order as generation, finalization, and sharing. Its
database transaction holds those lifecycle locks while it creates the audit claim, calls the email
provider, and commits. Dog deletion therefore has only two outcomes:

- deletion wins the dog lock first, so send returns 404 and no provider call or audit occurs; or
- send wins, provider delivery and its audit commit before deletion can cascade the rows.

Provider failure rolls back the provisional audit and releases deletion, preserving the existing
exact `{ "error": "send_failed" }` 502 response. The provider call has a hard ten-second abort
deadline, bounding the database connection and row-lock hold. The audit UUID is also sent to Resend
as its provider idempotency key.

Clients may supply an optional UUID `idempotencyKey`. A committed replay with the same recipient and
message returns the original audit without consuming quota or calling the provider again; reuse with
different content or scope returns `idempotency_conflict` 409. The primary-key claim and
`ON CONFLICT DO NOTHING` also serialize same-key requests across dogs before any provider call.
Existing clients remain compatible when they omit the key, while the deletion-triggered
email-plus-500 retry window is removed for every client.

Deferred-provider regressions observe the delete session blocked through provider completion. The
success case proves send/audit commit before delete; the provider-failure case proves audit rollback,
502 preservation, and subsequent deletion progress.

### 5. Finalized-only share minting

Authenticated share minting now rejects a latest draft with the existing `not_finalized` machine
code and 409 semantics already used by Brief send. Direct draft minting is covered. Deterministic
lock-driven races also prove that generation queued before share exposes no new draft and that
finalization queued before share allows the finalized Brief to be shared and publicly read.

All Brief lifecycle routes inspected in this round acquire locks dog first and Brief second. Dog
deletion acquires the dog row through `DELETE` before foreign-key cascading, so it participates in
the same lifecycle gate.

## TDD evidence

The first test-only run against the starting implementation exercised five affected files and
exited 1 with **10 intended failures and 82 passing tests**. It demonstrated the incorrect workflow
order, a real migration deadlock, absent provider deadline, draft-share publication, stale
finalization/deletion behavior, and send/delete inconsistency.

Additional RED cycles were witnessed as the rollout and retry contracts were tightened:

- The three-phase rollout regression failed while deploy still depended on the full migration.
- The predeploy migration-folder test failed before the rollout helper existed.
- The workflow test failed before Fly's rolling strategy was explicit.
- A malformed idempotency key was accepted before the shared schema field existed.
- Repeating one idempotency key delivered twice and returned different audit IDs before the
  transactional claim/replay implementation.

Every focused test subsequently passed. The final changed-surface matrix reported **6 files,
96 tests passed**. The concurrency selection was repeated five consecutive times; every run
reported **3 files, 9 selected tests passed and 72 skipped**, covering migration lock ordering,
generation/finalize/delete ordering, send replay/provider success/provider failure, and
draft/generate/finalize sharing races.

## Test and coverage matrix

- API: **51 files, 364 tests passed**.
- Web: **82 files, 404 tests passed**.
- Shared schemas: **8 files, 77 tests passed**.
- Shared i18n: **1 file, 13 tests passed**.
- Aggregate: **142 files, 858 tests passed**.

Fresh targeted V8 coverage reports were written outside the repository:

- `dogs.test.ts` plus `send-email.test.ts`: **2 files, 82 tests passed**.
  `dogs.ts` measured **86.76% statements/lines, 75.51% branches, 100% functions**;
  `send-email.ts` measured **100% statements/lines/functions and 83.78% branches**.
- `migration-rollout.test.ts`: **3 tests passed**.
  `migration-rollout.ts` measured **100% statements/lines/functions and 88.88% branches**.
- Workflow, rollout, migration, and share protocol selection: **4 files, 13 tests passed**;
  `share.ts` measured **100% statements/lines/functions**.

One attempted combined coverage invocation hit the established Better Auth database rate limit
after the rapid repeated concurrency runs. It was not counted as a product result; the same tests
passed in the final normal suite and in the split coverage invocations above.

The API suite emitted its established development-email and monitored-error diagnostics. The web
suite retained its established suspended-resource `act(...)` notices. The production build retained
its established Vite large-chunk advisory. None originates in this round's production paths.

## Full verification gates

| Gate | Result |
| --- | --- |
| Final changed-surface matrix | Exit 0; 6 files, 96 tests passed. |
| Repeated concurrency selection | Five consecutive exits 0; 9 selected tests passed each run. |
| Full repository test matrix | Exit 0; 142 files, 858 tests passed. |
| `pnpm lint` | Exit 0; 358 files checked; no fixes applied. |
| `pnpm typecheck` | Exit 0; all four TypeScript projects passed. |
| `pnpm build` | Exit 0; API TypeScript and web Vite production builds completed. |
| `drizzle-kit check` | Exit 0; `Everything's fine`. |
| Frozen lockfile | Exit 0; all five workspace projects already up to date. |
| Deployment YAML parse | Exit 0; Ruby parsed `.github/workflows/deploy.yml`. |
| Fresh predeploy database proof | Exit 0; 0013 applied and 0014 withheld (`t|f`). |
| Diff whitespace | Exit 0; `git diff --check` produced no findings. |
| Secret/debug/generated residue | No new credential literal, debug statement, lockfile change, coverage output, or generated residue. |

## Security, privacy, failure, and cost boundaries

- Ownership is checked both before and inside lifecycle transactions using the session-derived user
  ID. A stale initial lookup cannot authorize an operation after deletion or ownership mismatch.
- Recipient and optional message remain validation-bounded, and the client idempotency key must be a
  UUID. Replays are scoped to the same user and dog and compare recipient/message before returning an
  audit.
- Provider errors and abort reasons are not returned to clients. Email bodies, recipients, Brief
  content, share tokens, and idempotency values are not added to telemetry or application logs by
  these changes.
- Provider delivery is the unavoidable non-transactional boundary. Database lifecycle locks plus
  provider idempotency give a single durable claim and remove the known delete/500 duplicate-retry
  window. Provider success followed by a database-level commit failure remains protected at the
  provider from redelivery only when the client reuses its idempotency key; the API cannot make an
  external provider and PostgreSQL atomically commit without a durable outbox/worker.
- Holding one database connection and two same-dog lifecycle locks across provider I/O is a deliberate
  bounded trade-off. The ten-second abort deadline caps the hold, requests for other dogs can proceed,
  and no polling or unbounded retry was introduced.
- `EXCLUSIVE` on `dogs` temporarily blocks dog writers and row-locking lifecycle routes during 0014,
  but not ordinary dog reads. It is acquired before the Brief table lock to eliminate the cycle and
  is used only in the one-time unshipped migration.
- The predeploy helper creates its migration folder under the operating-system temporary directory
  and removes it in nested cleanup even if database-pool shutdown fails. It copies only migration tags
  present in the checked-in journal and never accepts request data.

## Files changed

Deployment and migration runtime:

- `.github/workflows/deploy.yml`
- `apps/api/package.json`
- `apps/api/drizzle/0014_third_madripoor.sql`
- `apps/api/src/db/migrate-predeploy.ts`
- `apps/api/src/db/migration-rollout.ts`

API/shared runtime:

- `apps/api/src/email/send-email.ts`
- `apps/api/src/routes/dogs.ts`
- `packages/shared/src/brief.ts`

Regressions and test support:

- `apps/api/src/deploy-workflow.test.ts`
- `apps/api/src/db/migration-0014.test.ts`
- `apps/api/src/db/migration-rollout.test.ts`
- `apps/api/src/email/send-email.test.ts`
- `apps/api/src/routes/dogs.test.ts`
- `apps/api/src/routes/share.test.ts`
- `apps/api/src/test-pg-concurrency.ts`
- `packages/shared/src/brief.test.ts`

Evidence:

- `.superpowers/sdd/2026-08-23-end-to-end-localization/final-review-round-9-fix-report.md`

## Concerns

No unresolved round-9 finding remains in the implemented scope. The two deliberate operational
contracts are explicit: future migrations must update the fail-closed pre/post-deploy boundary, and
send holds a same-dog transaction for at most the provider deadline. A durable outbox could remove
provider I/O from the transaction in a later architectural change, but it is not required to close
the verified deletion/retry race. User documentation is intentionally unchanged pending the next
Luna/Terra review verdicts.
