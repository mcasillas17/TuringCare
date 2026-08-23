# Final dual-review round 10 fix report

**Starting commit:** `36237e331ffe2ddb87fa6bd82f7b601b4a429874`
**Scope:** The six verified round-10 production-image, rollout-order, legacy-Brief,
idempotency, and quota findings only. User-facing documentation remains intentionally
deferred until both reviewers evaluate this commit.

## Findings and implementation

### 1. Production API image and executable smoke

`Dockerfile.api` now includes `packages/i18n/package.json` in the dependency layer and
the complete `packages/i18n` source in the runtime source layer. The deploy CI builds the
exact production Dockerfile and executes `scripts/smoke-api-image.sh`, which starts the
image with the CI PostgreSQL service and requires `/health` to return success. The script
fails immediately if required environment is absent, prints container logs if startup
exits, bounds health polling to 30 seconds, and always removes its container.

A fresh local Docker build completed and the built image served `/health` successfully.

### 2. Whole-rollout serialization

The deploy workflow now has one repository production concurrency group with
`cancel-in-progress: false`. A running migration/API/schema/web sequence therefore cannot
be cancelled or interleaved by a later push. The regression checks both settings at the
workflow boundary.

### 3. Web publication depends on API/schema compatibility

`deploy-web` now depends on the final `migrate` phase instead of only CI. Its complete
dependency path is consequently compatible migration -> rolling API replacement -> final
migration -> web publication. Any failed API or migration phase prevents publication of a
web build that expects the new locale contract.

### 4. Pre-0014 duplicate maximum Briefs fail closed

Every authenticated latest-Brief consumer now queries the two greatest versions and uses
one shared resolver. Equal maximum versions produce the stable
`brief_version_conflict` 409 instead of selecting by unspecified row order. This covers:

- latest Brief read;
- finalization;
- share-token minting;
- share-token revocation; and
- new email delivery.

The compatibility regression temporarily recreates the real pre-0014 window, inserting
equal version 7 rows with different timestamps, statuses, locales, and share-token state.
All five endpoints return the same 409, no email or audit occurs, and neither row changes.
Generation is intentionally still permitted: it creates version 8, after which the latest
read is unambiguous. The migration remains the eventual repair for all historic duplicate
versions.

### 5. First-party idempotent send intent

`SendPanel` creates a UUID for each normalized recipient/message intent and retains it in
component memory across every ambiguous failure. Retrying unchanged values sends the same
key; changing recipient or message creates a new key; a definitive successful response
clears it. No recipient or message fingerprint is persisted to browser storage.

The generator uses native `crypto.randomUUID()` when available and an RFC 4122 v4 UUID
built from `crypto.getRandomValues()` otherwise. It never falls back to `Math.random`; a
browser without secure randomness fails locally before any delivery request. Existing API
tests prove the same UUID becomes the audit primary key and provider idempotency key, and
that a committed replay returns one audit with one provider call.

### 6. Per-user quota serialization across dogs

Brief send now locks the authenticated user's database row before the dog and Brief rows.
The global send order is user -> dog -> Brief. This serializes the daily count across every
dog owned by one account while remaining compatible with account deletion (user first) and
dog deletion (dog only). It uses PostgreSQL row locks, never a process mutex.

The two-dog barrier regression seeds nine sends, queues two sends behind the same user row,
then releases them. Exactly one response is 201, the other is 429, the provider is called
once, and the committed count is exactly ten. A second lock-order regression queues send
behind an account deletion's user lock and proves deletion completes without a deadlock,
the queued send returns 404, and no provider call occurs.

## TDD evidence

- Deployment regressions produced three intended failures before workflow concurrency,
  web dependency, and image smoke steps existed.
- The latest-Brief helper test first failed because the module did not exist. A mutation
  that disabled duplicate detection made the route regression observe
  `[200, 200, 409, 200, 201]` instead of five 409s and caused a provider delivery.
- SendPanel retry tests first observed missing idempotency keys on both requests, and the
  secure-generator test first failed because its module did not exist.
- The two-dog quota regression first observed `[201, 201]`, two provider deliveries, and
  eleven committed sends. With the user-row lock it observes `[201, 429]`, one delivery,
  and ten sends.
- The final affected API selection passed **5 files / 101 tests**. The final affected web
  selection passed **3 files / 20 tests**.
- Five consecutive concurrency/compatibility stress runs each passed **5 selected tests**
  (legacy duplicate behavior, committed replay, cross-dog quota, provider/delete success,
  and provider/delete rollback). Five additional consecutive lock-order runs each passed
  the cross-dog quota and account-deletion regressions.

## Test and coverage matrix

- API: **52 files, 373 tests passed**.
- Web: **83 files, 409 tests passed**.
- Shared schemas: **8 files, 77 tests passed**.
- Shared i18n: **1 file, 13 tests passed**.
- Aggregate: **144 files, 872 tests passed**.

Fresh targeted V8 coverage was written outside the repository:

- API: **3 files, 80 tests passed**. `latest-brief.ts` measured **100% statements,
  branches, functions, and lines**; `dogs.ts` measured **89.75% statements/lines,
  76.51% branches, and 100% functions**.
- Web: **2 files, 14 tests passed**. `brief-idempotency.ts` measured **100% statements,
  lines, and functions**; `send-panel.tsx` measured **96.84% statements/lines,
  95.23% branches, and 100% functions**.

The API suite retained its established development-email and monitored-error diagnostics.
The web suite retained its established suspended-resource `act(...)` notices. The build
retained its established Vite large-chunk advisory. Docker emitted only its local legacy
builder deprecation advisory. None originates from a failing round-10 product path.

## Full verification gates

| Gate | Result |
| --- | --- |
| Full repository test matrix | Exit 0; 144 files, 872 tests passed. |
| Repeated concurrency selection | Five 5-test compatibility runs and five 2-test lock-order runs exited 0. |
| `pnpm lint` | Exit 0; 362 files checked; no fixes applied. |
| `pnpm typecheck` | Exit 0; all four TypeScript projects passed. |
| `pnpm build` | Exit 0; API TypeScript and web Vite production builds completed. |
| `drizzle-kit check` | Exit 0; `Everything's fine`. |
| Frozen lockfile | Exit 0; all five workspace projects already up to date. |
| Deployment YAML parse | Exit 0; Ruby parsed `.github/workflows/deploy.yml`. |
| Production Docker image | Exit 0; image built with shared i18n and served `/health`. |
| Diff whitespace | Exit 0; `git diff --check` produced no findings. |
| Secret/debug/generated residue | No credential literal, debug statement, coverage output, or generated residue. |

## Security, privacy, and failure boundaries

- HTTP identity remains session-derived and dog ownership is revalidated under lock.
- Legacy database ambiguity is never resolved from timestamp, status, locale, or physical
  row order; it returns a machine code without exposing either artifact.
- Idempotency input remains server-validated as a UUID. Client keys use browser
  cryptographic randomness, and recipient/message contents are not persisted for retries.
- Provider failure still returns the exact privacy-safe `send_failed` 502 and rolls back its
  provisional audit. The retained client key makes the later unchanged retry safe if the
  response was lost after provider acceptance.
- Quota state is serialized in PostgreSQL and re-counted after the prior transaction
  commits. The user -> dog -> Brief order has no opposing edge in account or dog deletion.
- Docker environment omission, container exit, health timeout, and missing secure browser
  randomness all fail loudly; none is converted into an indistinguishable success value.

## Files changed

Deployment:

- `.github/workflows/deploy.yml`
- `Dockerfile.api`
- `scripts/smoke-api-image.sh`
- `apps/api/src/deploy-workflow.test.ts`

API behavior and regressions:

- `apps/api/src/db/latest-brief.ts`
- `apps/api/src/db/latest-brief.test.ts`
- `apps/api/src/routes/dogs.ts`
- `apps/api/src/routes/dogs.test.ts`
- `apps/api/src/test-helpers.ts`

Web behavior and regressions:

- `apps/web/src/lib/brief-idempotency.ts`
- `apps/web/src/lib/brief-idempotency.test.ts`
- `apps/web/src/components/brief/send-panel.tsx`
- `apps/web/src/components/brief/send-panel.test.tsx`

Evidence:

- `.superpowers/sdd/2026-08-23-end-to-end-localization/final-review-round-10-fix-report.md`

## Concerns

No unresolved round-10 finding remains in the implemented scope. The in-memory client key
deliberately covers retries while the logical form remains mounted without persisting
recipient or message data; a full page reload begins a new browser submission lifecycle.
The Docker smoke is a dedicated deployment gate, so ordinary unit-test runs do not require
Docker.
