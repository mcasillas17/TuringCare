# Final dual-review round 8 fix report

**Starting commit:** `02f182ea01029ecac175c49e9eab05152eb0379c`
**Scope:** Verified round-8 migration, share-token, and concurrent-deletion findings only.

## Findings and implementation

1. Migration 0014 now takes `SHARE ROW EXCLUSIVE` on `briefs` as its first statement. Drizzle's
   PostgreSQL migrator executes all statements for pending migrations inside one transaction, so
   the lock remains held through duplicate repair, unique-constraint creation, and migration
   commit. Reads remain available; legacy inserts, updates, and deletes wait until the repaired
   invariant is enforced.
2. Share mint and revoke now run in database transactions with a consistent dog-then-Brief row-lock
   order. The dog lock serializes latest-Brief selection with Brief generation, while the Brief lock
   serializes the token transition against direct row writers. Concurrent operations are
   linearizable: every response describes its own committed transition, and a later queued
   operation may supersede it. Two simultaneous mints therefore return the same live token; a
   revoke queued before mint clears the old token before mint creates and returns a new one.
3. Brief generation now validates the authenticated dog row returned by the in-transaction
   `FOR UPDATE`. If concurrent deletion wins first, the transaction returns no Brief and the route
   responds with the existing `{ "error": "not_found" }` 404 contract instead of attempting an
   insert that violates the foreign key.

No process mutex, retry loop, new dependency, schema snapshot change, authorization expansion, or
public-response expansion was introduced.

## TDD evidence

The first test-only focused run against the starting implementation exited 1 with exactly the
intended four failures and **69 other tests passing**:

- Migration writer returned `writer_completed` instead of `writer_blocked`.
- Two simultaneous successful mint responses contained two different tokens.
- Mint completed from stale state while an earlier revoke was queued.
- Concurrent dog deletion returned 500 instead of 404.

After the smallest runtime changes, the focused matrix exited 0 with **3 files, 73 tests passed**.
The final focused run after all test tightening also exited 0 with **3 files, 73 tests passed**.

The three lock-state route regressions were rerun five consecutive times: each run reported
**3 passed**. The isolated migration concurrency regression was also rerun five consecutive times:
each run reported **1 passed**.

## PostgreSQL migration proof

`apps/api/src/db/migration-0014.test.ts` executes the real migration SQL statements in one explicit
transaction against a unique isolated PostgreSQL schema and uses a second physical session as a
legacy writer. It observes PostgreSQL's direct/transitive blocking graph rather than sleeping for a
guessed duration. The fixture proves that:

- The writer is blocked before duplicate repair starts.
- Duplicate versions are deterministically repaired to `1,2`.
- An already-valid gap sequence `2,4` is unchanged.
- Constraint creation and migration commit complete while the writer remains blocked.
- The released writer fails with PostgreSQL `23505` naming
  `briefs_dog_id_version_unique`.
- Every isolated schema and pooled session setting is cleaned up on success or failure.

`drizzle-kit check` exited 0 with `Everything's fine`. Migration 0014's snapshot and journal remain
consistent because the new lock changes execution safety, not the resulting schema.

## Test and coverage matrix

- Shared i18n: **1 file, 13 tests passed**.
- Shared schemas: **8 files, 76 tests passed**.
- API: **49 files, 351 tests passed**.
- Web: **82 files, 404 tests passed**.
- Aggregate: **140 files, 844 tests passed**.

Targeted V8 coverage ran the three changed-surface suites with reports outside the repository. It
passed all 73 tests and measured `apps/api/src/routes/dogs.ts` at **91.82% statements/lines,
76.12% branches, and 100% functions**. Remaining uncovered route lines are unrelated existing
validation, focus, and send branches.

The API suite printed its established development-email and monitoring-path diagnostics. The web
suite printed the established suspended-resource `act(...)` notices in Brief/share tests. No new
branch-owned warning or error appeared.

## Full verification gates

| Gate | Result |
| --- | --- |
| Focused changed surface | Exit 0; 3 files, 73 tests passed. |
| Full API suite | Exit 0; 49 files, 351 tests passed. |
| Shared i18n suite | Exit 0; 1 file, 13 tests passed. |
| Shared schema suite | Exit 0; 8 files, 76 tests passed. |
| Full web suite | Exit 0; 82 files, 404 tests passed. |
| `pnpm lint` | Exit 0; 354 files checked; no fixes applied. |
| `pnpm typecheck` | Exit 0; all four TypeScript projects passed. |
| `pnpm build` | Exit 0; API TypeScript and web Vite production builds completed. |
| `drizzle-kit check` | Exit 0; `Everything's fine`. |
| Frozen lockfile | Exit 0; all five workspace projects checked. |
| Peer compatibility | Exit 0; no peer dependency issues. |

The production build retained the established Vite large-chunk advisory. No dependency or
lockfile changed in this round.

## Security, privacy, failure, and concurrency boundaries

- The initial ownership lookup and locked-row predicate both require the authenticated user's ID;
  a caller cannot select another owner's row or lock target.
- Share tokens remain 144-bit server-generated values, are returned only from the authenticated
  mint route, and are not added to logs, telemetry, migration literals, or error responses.
- Public share reads retain their strict field projection. The concurrency tests prove old tokens
  become inaccessible after revoke and the committed replacement token remains accessible.
- Missing locked dogs and missing latest Briefs return their existing stable 404 codes. Unexpected
  database failures roll back and retain the original database cause; no empty-success fallback or
  partial token response is produced.
- The migration changes no Brief content and deletes no rows. It blocks writers only while repair
  and constraint creation execute in the migration transaction.
- The repeated request cost is two indexed row reads/locks plus at most one indexed update. Locks
  contend only for operations on the same dog; no unbounded retry or process-local coordination is
  used.
- Concurrent dog deletion produces no Brief, telemetry event, token, authored-content log, or
  leaked database error.

## Files changed

Runtime and migration:

- `apps/api/drizzle/0014_third_madripoor.sql`
- `apps/api/src/routes/dogs.ts`

Regressions and test support:

- `apps/api/src/db/migration-0014.test.ts`
- `apps/api/src/routes/dogs.test.ts`
- `apps/api/src/routes/share.test.ts`
- `apps/api/src/test-pg-concurrency.ts`

Evidence:

- `.superpowers/sdd/2026-08-23-end-to-end-localization/final-review-round-8-fix-report.md`

## Concerns

No unresolved round-8 migration-writer, share-token, concurrent-deletion, authorization,
privacy, coverage, typecheck, build, or schema-consistency concern remains. The established web
test and production-build notices described above are unchanged and outside this diff.
