# Final dual-review round 11 fix report

**Starting commit:** `1d08e40fba102bc9c0fc82ad96a860b7451c65df`
**Scope:** The three verified round-11 overview ambiguity, stable web error,
and idempotent-send telemetry findings only. User-facing documentation remains
deferred until both reviewers evaluate the resulting commit.

## Findings and implementation

### 1. Overview readers fail closed on a duplicate maximum Brief version

The existing latest-Brief resolver now has a grouped form that sorts and
resolves each dog's history independently. Both overview readers reuse it.
Their database queries join each dog to its maximum version, so they load only
the tied maximum row or rows rather than every historical Brief.

The account overview returns `latestBrief: null` and the additive
`latestBriefAmbiguous: true` if any owned dog has an ambiguous maximum. The
per-dog overview retains `briefStatus` and `briefVersion`, sets both to `null`
for the affected dog, and adds `briefAmbiguous: true`. The old nullable fields
therefore remain backward compatible while neither endpoint selects a status,
timestamp, locale, or artifact from an ambiguous pair. Normal and empty
responses explicitly return `false` for the new flags.

The real pre-0014 compatibility regression inserts equal version 7 rows with
different timestamps and statuses, then verifies both overview endpoints.
Additional unit and route tests cover independent grouped histories, a normal
selected account Brief, empty histories, and out-of-order timestamps.

### 2. Brief hooks preserve allowlisted machine codes and SendPanel localizes them

The web now parses only this fixed server-code allowlist:

- `not_found`
- `not_finalized`
- `send_failed`
- `brief_version_conflict`
- `idempotency_conflict`
- `send_rate_limited`

Every Brief query/mutation hook uses one parser. `BriefRequestError` retains the
allowlisted code, HTTP status, and operation context (`load`, `generate`,
`finalize`, `share`, `revoke`, or `send`). Malformed JSON, nested values,
unknown values, response messages, and arbitrary response text are ignored in
favor of the fixed operation fallback.

SendPanel maps version ambiguity, idempotency conflict, rate limiting, missing
Brief, unfinalized Brief, and delivery failure to catalog keys. English and
Spanish catalogs contain distinct messages for all three newly surfaced
outcomes, with catalog-runtime and Spanish UI assertions. A definitive
`idempotency_conflict` clears the retained client key so an unchanged retry
can create a fresh intent; ambiguous transport failures still retain the same
key.

### 3. Replayed sends do not duplicate `brief.emailed`

The send transaction now distinguishes `sent` from `replayed`. Both the
already-committed path and the post-insert conflict-recovery path share one
intent classifier; mismatched or cross-owner keys remain
`idempotency_conflict`. Only a newly delivered `sent` result records
`brief.emailed`. HTTP compatibility is retained: successful replays still
return the original audit row with 201.

Regressions assert provider, audit, and emailed-event counts for:

- a sequential committed replay;
- two simultaneous same-user requests;
- a sequential mismatched replay; and
- a concurrent global-key collision between two owners, which reaches the
  post-insert conflict path.

Every case commits at most one audit, calls the provider once, and records one
emailed event. The cross-owner collision returns one 201 and one privacy-safe
`idempotency_conflict` 409.

## TDD evidence

- The first API RED run could not import the grouped resolver, selected the
  duplicate overview row, and recorded two emailed events on replay.
- The first web RED run could not import the stable parser and all three
  Spanish outcomes rendered the generic send failure.
- A separate RED regression proved an unchanged retry reused a definitively
  conflicted key before SendPanel cleared it.
- Focused GREEN selection: **4 API files / 88 tests** and **4 web files / 36
  tests**.
- Five consecutive compatibility/concurrency stress selections each passed
  the duplicate-overview, same-user replay, and global-key collision tests.

## Test and coverage matrix

- API: **52 files, 378 tests passed**.
- Web: **85 files, 428 tests passed**.
- Shared schemas: **8 files, 77 tests passed**.
- Shared i18n: **1 file, 14 tests passed**.
- Aggregate: **146 files, 897 tests passed**.

Fresh targeted V8 coverage was written outside the repository:

- API: **4 files, 88 tests passed**; **93.08% statements/lines, 81.62%
  branches, and 100% functions**. `latest-brief.ts` and `dogs-overview.ts`
  measured 100% in every category; `overview.ts` measured 100% statements,
  lines, and functions.
- Web: **4 files, 36 tests passed**; **98.04% statements/lines, 92.75%
  branches, and 100% functions**. `brief.ts` measured 100% in every category,
  `brief-errors.ts` measured 96.61% statements/lines, and `send-panel.tsx`
  measured 96.93% statements/lines.

The API suite retained its established development-email and monitored-error
diagnostics. The web suite retained its established suspended-resource
`act(...)` notices. The build retained its established Vite large-chunk
advisory. Docker retained its local legacy-builder deprecation advisory. None
originates from a failing round-11 path.

## Full verification gates

| Gate | Result |
| --- | --- |
| Full repository test matrix | Exit 0; 146 files, 897 tests passed. |
| Repeated compatibility/concurrency selection | Five 3-test runs exited 0. |
| `pnpm lint` | Exit 0; 365 files checked; no fixes applied. |
| `pnpm typecheck` | Exit 0; all four TypeScript projects passed. |
| `pnpm build` | Exit 0; API TypeScript and web Vite production builds completed. |
| `drizzle-kit check` | Exit 0; `Everything's fine`. |
| Frozen lockfile | Exit 0; all five workspace projects already up to date. |
| Deployment YAML parse | Exit 0; Ruby parsed `.github/workflows/deploy.yml`. |
| Production Docker image | Exit 0; the exact image built and served `/health`. |
| Diff whitespace | Exit 0; `git diff --check` produced no findings. |
| Secret/debug/generated residue | No credential literal, debug statement, tracked coverage output, or generated residue. Temporary image tags were removed after smoke. |

## Security, privacy, and failure boundaries

- Both overview routes remain authenticated and owner-scoped. Ambiguity flags
  disclose only a consistency state to the owning user; they expose neither
  conflicting artifact.
- Duplicate maximum versions are never resolved from status, timestamp,
  locale, physical order, or authored summary content.
- Client parsing never displays or stores arbitrary server error text. It
  accepts one exact allowlist and fixed local fallbacks, while retaining only
  status and operation context in memory.
- Idempotency keys remain UUID-validated and cross-owner collisions do not
  reveal the other owner, recipient, message, dog, Brief, or send row.
- Recipient and message values are not added to telemetry or browser storage.
  The new event gate changes only whether the existing fixed event name is
  emitted.

## Files changed

API behavior and regressions:

- `apps/api/src/db/latest-brief.ts`
- `apps/api/src/db/latest-brief.test.ts`
- `apps/api/src/lib/dogs-overview.ts`
- `apps/api/src/lib/dogs-overview.test.ts`
- `apps/api/src/routes/overview.ts`
- `apps/api/src/routes/overview.test.ts`
- `apps/api/src/routes/dogs.ts`
- `apps/api/src/routes/dogs.test.ts`

Web behavior and regressions:

- `apps/web/src/lib/brief-errors.ts`
- `apps/web/src/lib/brief-errors.test.ts`
- `apps/web/src/lib/brief.ts`
- `apps/web/src/lib/brief.test.tsx`
- `apps/web/src/lib/brief-send.ts`
- `apps/web/src/components/brief/send-panel.tsx`
- `apps/web/src/components/brief/send-panel.test.tsx`
- `apps/web/src/lib/dogs.ts`

Catalogs and catalog regression:

- `packages/i18n/src/en.ts`
- `packages/i18n/src/es.ts`
- `packages/i18n/src/index.test.ts`

Evidence:

- `.superpowers/sdd/2026-08-23-end-to-end-localization/final-review-round-11-fix-report.md`

## Concerns

No unresolved round-11 finding remains in the implemented scope. The new
ambiguity fields are additive and current UI consumers intentionally continue
to interpret the retained nullable status/artifact fields; a future product
design may choose to show a dedicated repair notice. Successful HTTP replay
continues to return 201 for backward compatibility even though the internal
result is now explicitly `replayed`.
