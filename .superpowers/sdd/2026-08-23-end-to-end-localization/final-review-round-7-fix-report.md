# Final dual-review round 7 fix report

Date: 2026-08-23

Starting commit: `dd73d8484f115ac1a7b7c6eebaa7c6584210a6a1`

Scope source: `final-review-round-7-findings.md`

Runtime: Node `v22.23.2`, pnpm `11.1.2`

## Outcome

Both verified round-7 findings are resolved. Brief generation now allocates versions inside a
short PostgreSQL transaction after locking the parent dog row `FOR UPDATE`. That parent row is the
shared, per-dog serialization point across processes and hosts: each waiter reads the greatest
committed version only after the preceding generator commits. A database unique constraint on
`(dog_id, version)` independently enforces the invariant for every writer.

Migration `0014_third_madripoor.sql` repairs only dogs that already have duplicate versions before
adding the constraint. It deterministically ranks those rows by prior version, generation time,
and UUID. Dogs whose valid version sequence merely contains gaps are not rewritten. The migration
was exercised from a schema migrated through 0013 with both duplicate and nonduplicate fixtures.

Authentication verification/reset HTML and stored-locale Brief email HTML now declare the
validated locale on the root element as `lang="en"` or `lang="es"`. The locale remains a shared
two-value `Locale` union; no untrusted raw string reaches the attribute.

No user documentation was edited, as requested. The approved specification and implementation
plan remain unchanged. This report is the only SDD evidence file added.

## Finding-by-finding resolution

| Finding | Resolution | Regression proof |
| --- | --- | --- |
| Concurrent per-dog Brief versions | Moved version read plus insert into a Drizzle transaction that locks the existing parent dog row before reading the prior maximum. Added the `(dog_id, version)` unique constraint and additive migration 0014, including deterministic repair for any preexisting duplicate-version dogs. | Eight actual concurrent API requests using alternating English/Spanish locales now return exactly versions 1 through 8 with distinct ids. GET latest, finalize, share/public read, and send-email all select the same version-8 id/locale/summary. A direct duplicate insert is rejected by the named database constraint. |
| Email HTML document language | Threaded the already validated `Locale` into the authentication layout and used the stored Brief locale in the Brief email root element. | Unit and Better Auth wiring tests assert English and Spanish `lang` attributes for verification and reset messages; Brief email tests assert both locales, and the concurrent Brief flow asserts the sent message uses the latest stored locale rather than the opposite request locale. |

## RED evidence

The regressions were added before runtime or schema edits and run against the starting commit.
The focused run exited 1 with **3 files, 81 tests: 77 passed and 4 failed**:

- Eight concurrent Brief-generation requests returned versions
  `[1, 1, 1, 1, 1, 2, 2, 2]` instead of `[1, 2, 3, 4, 5, 6, 7, 8]`.
- English/Spanish Brief email HTML failed because the root was a bare `<html>` element.
- English authentication email HTML failed the `lang="en"` assertion.
- Spanish authentication email HTML failed the `lang="es"` assertion.

These were behavior failures, not missing-environment, timeout, or fixture failures.

## Production approach and invariant

The summary is composed before allocation so the database lock covers only version allocation and
insert. Inside the transaction:

1. `SELECT` the owned dog row `FOR UPDATE`.
2. Read that dog's greatest Brief version.
3. Insert exactly the next version and commit.

PostgreSQL row locks make concurrent generators wait at step 1. Once a waiter acquires the lock,
the preceding insert is committed and visible at step 2. This uses database state rather than a
process-local mutex, requires no retry loop, and serializes different dogs independently.

The unique constraint is defense in depth for alternate or future writers. Migration 0014 first
identifies only dogs with duplicate versions. For those dogs it assigns consecutive integer
versions in deterministic prior-version/generated-time/id order, then adds the constraint. An
isolated migration smoke test produced duplicate-dog versions `1,2,3`, preserved a nonduplicate
gap sequence as `2,4`, found exactly one named constraint, and proved a subsequent duplicate insert
raises `unique_violation`.

Latest-selection sweep:

- Dog Brief GET, share mint/revoke, finalize, and send all order by unique per-dog version.
- The web PDF model consumes the Brief returned by the same latest GET and retains its stored locale.
- Public share reads the unique token attached to that selected row.
- Per-dog dashboard summaries now order by version first; a regression proves version wins even
  when timestamps are out of order.
- The account overview's cross-dog "most recently generated" query retains generation time as its
  primary meaning and adds version/id tie-breakers for deterministic equal timestamps.

## GREEN evidence

The post-migration focused changed-surface run completed with exit 0: **5 files, 87 tests passed**.
It included the eight-request concurrency flow, every latest consumer named above, authentication
and Brief email roots, per-dog overview ordering, and cross-dog overview coverage.

The final Better Auth/email focused run completed with exit 0: **3 files, 24 tests passed**.

The final full API suite completed with exit 0: **48 files, 347 tests passed**. Combined with the
latest unchanged shared i18n, shared-schema, and web runs, the current matrix is **139 files,
840 tests passed**:

- Shared i18n: 1 file, 13 tests.
- Shared schemas: 8 files, 76 tests.
- API: 48 files, 347 tests.
- Web: 82 files, 404 tests.

The API suite printed its established development-email and monitoring-test diagnostics. The web
suite printed the established suspended-resource `act(...)` notices in Brief/share tests. No new
branch-owned warning or error appeared.

## Full verification gates

| Gate | Final result |
| --- | --- |
| `pnpm lint` | Exit 0; 352 files checked; no fixes applied. |
| `pnpm typecheck` | Exit 0; i18n, shared, API, and web TypeScript projects passed. |
| `pnpm build` | Exit 0; API TypeScript and web Vite production builds completed. |
| `drizzle-kit check` | Exit 0; `Everything's fine` for migration snapshots. |
| Isolated migration fixture | Exit 0; repaired duplicates to `1,2,3`, preserved valid gaps `2,4`, added one constraint, and rejected a duplicate. |
| Local database migration | Exit 0; migration applied successfully before constraint-backed API tests. |
| Frozen lockfile | Exit 0; `pnpm install --lockfile-only --frozen-lockfile`. |
| Peer compatibility | Exit 0; `pnpm peers check` reported no peer dependency issues. |

The production build retained the existing Vite large-chunk advisory. No dependency or lockfile
changed in this round.

## Targeted changed-surface coverage

Coverage used the V8 provider with `/tmp/turingcare-round-7-coverage` as its report directory; no
coverage artifact entered the repository. The five-file focused matrix passed all 87 tests. Across
the five changed production route/email/overview files it reached **91.30% statements/lines,
80.48% branches, and 100% functions**. Both email files and the per-dog overview reached 100% for
statements, branches, functions, and lines. Remaining uncovered route lines are unrelated existing
validation, revoke-without-Brief, and activity-mapping branches.

## Security, privacy, failures, and cost

- The row lock key is the server-resolved owned dog UUID; clients cannot supply another user's
  authority because the existing authenticated ownership lookup remains first.
- The transaction contains no user-authored template execution, network call, email send, telemetry
  write, or unbounded retry. Its repeated cost is one indexed parent-row lock/select plus one
  indexed latest-version select per generation; only concurrent generation for the same dog waits.
- The unique constraint closes the invariant at persistence, including writers outside this route.
- Migration repair changes only duplicate-version dogs and retains every Brief row, stored locale,
  status, summary, share token, and send relation. It neither deletes nor exposes content.
- Email `lang` values come only from the `Locale` union after existing header allowlisting or from a
  stored enum. User-authored dog names, owner names, messages, summaries, and URLs retain the
  existing HTML escaping.
- No locale, account identity, recipient, summary, token, or authored content was added to logs,
  telemetry, translated catalogs, or migration literals.
- Stable API error codes, authorization outcomes, send-rate limits, and provider-failure behavior
  are unchanged.

## Cleanup and sweeps

- Read the complete changed diff and generated snapshot; all changes are runtime, regression,
  additive migration, generated migration metadata, or this report.
- `git diff --check` completed without whitespace errors.
- Added-line secret scan found no private key, API credential, credentialed URL, or secret value.
- Added-line debug scan found no `.only`, `.skip`, `debugger`, debug logging, TODO, or FIXME.
- The temporary migration database was dropped by an exit trap; coverage stayed under `/tmp`.
- No product documentation, approved spec/plan, manifest, dependency, lockfile, build artifact,
  cache, LCOV output, `.DS_Store`, or scratch file was added.
- No assertion, timeout, retry, lint rule, migration check, or test gate was weakened.

## Files changed

Runtime and schema:

- `apps/api/src/db/schema.ts`
- `apps/api/src/routes/dogs.ts`
- `apps/api/src/lib/dogs-overview.ts`
- `apps/api/src/routes/overview.ts`
- `apps/api/src/email/templates.ts`
- `apps/api/src/email/brief-email.ts`

Migration:

- `apps/api/drizzle/0014_third_madripoor.sql`
- `apps/api/drizzle/meta/0014_snapshot.json`
- `apps/api/drizzle/meta/_journal.json`

Regression tests:

- `apps/api/src/routes/dogs.test.ts`
- `apps/api/src/lib/dogs-overview.test.ts`
- `apps/api/src/auth-email.test.ts`
- `apps/api/src/email/templates.test.ts`
- `apps/api/src/email/brief-email.test.ts`

SDD evidence:

- `.superpowers/sdd/2026-08-23-end-to-end-localization/final-review-round-7-fix-report.md`

## Concerns

No unresolved round-7 concurrency, deterministic-latest, migration, email-language,
security/privacy, coverage, typecheck, or build concern remains. The established web test/build
notices described above are unchanged and outside this diff.
