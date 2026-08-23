# Final dual-review round 5 fix report

Date: 2026-08-23

Starting commit: `7f524eb`

Scope source: `final-review-round-5-findings.md`

Runtime: Node `26.5.0`, pnpm `11.1.2`

## Outcome

Both verified round-5 findings are resolved. A single framework-neutral runtime predicate now
defines a session user id as a string containing at least one non-whitespace character. The four
requested consumers use that predicate for routing, directory chrome, and React Query identity.
Empty, whitespace-only, and numeric ids therefore follow anonymous/public behavior rather than
rendering protected content, redirecting between login and the app, selecting authenticated
chrome, or becoming a private-cache identity. The valid `u1` path is unchanged.

Week-grid filled-cell ARIA labels now choose explicit singular or plural catalog keys. English and
Spanish both announce one session correctly and retain plural copy for larger counts. The visual
dot/count marker, focus/session arrays, stable ids, timestamps, grouping keys, callbacks, and
authored skill/goal content are unchanged.

No product documentation, approved specification, plan, migration, schema, dependency metadata,
or lockfile changed. This report is the only SDD artifact added.

## Finding-by-finding resolution

| Finding | Resolution | Regression proof |
| --- | --- | --- |
| Inconsistent runtime session user-id validation | Added pure `isNonemptySessionUserId(value: unknown): value is string` and used it in `RequireAuth`, `RedirectIfAuthed`, `DirectoryLayout`, and `SessionQueryBoundary`. Invalid ids normalize to the existing anonymous `null` identity without trimming or rewriting valid ids. | Focused component tests cover `''`, whitespace, and a number at every requested boundary. Cache tests prove anonymous readiness plus private-profile removal. Composed main/router tests prove the login form remains reachable without a loop and the directory renders public chrome. Existing valid `u1` tests remain green. |
| Week-grid singular ARIA copy | Replaced the single plural-only key with typed `cellFilledOne` and `cellFilledOther` keys in both catalogs, following the repository's existing explicit typed plural convention. `WeekGrid` selects the key from the existing session count. | A focused WeekGrid matrix covers one and two sessions in English and Spanish and asserts the existing visual `●`/`2` markers. The composed Spanish Dog Week test now expects `1 sesión`. |

## Runtime identity policy

- Session data is treated as runtime input at each requested consumer boundary.
- `null`, missing shape, empty strings, whitespace-only strings, and non-strings resolve to the
  established anonymous identity.
- Valid strings are passed through byte-for-byte; the predicate only tests `trim().length` and
  does not create a different cache key.
- `RequireAuth` redirects invalid identities to login, while `RedirectIfAuthed` renders the auth
  page, preventing a redirect cycle.
- `DirectoryLayout` chooses `PublicLayout` for invalid identities instead of `AppShell`.
- `SessionQueryBoundary` clears session-scoped queries and mutations before publishing the
  anonymous identity as ready.

## RED evidence

The requested behaviors were added before production changes and observed failing for the intended
reasons. The initial focused run showed all three malformed ids selecting authenticated behavior in
`RedirectIfAuthed` and `DirectoryLayout`; whitespace remained a non-anonymous query identity; and
English/Spanish one-session labels remained plural. The composed `/login` case reproduced the
redirect cycle and kept the runner active until it was stopped after the failure was established.
The existing valid-id tests were already green.

## Focused GREEN evidence

`NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @turingcare/web exec vitest run` over
RequireAuth, RedirectIfAuthed, DirectoryLayout, SessionQueryBoundary, main/router, WeekGrid, and Dog
Week completed with exit 0: **7 files, 36 tests passed**.

## Full verification gates

The API test gate used the documented local PostgreSQL test database and test-only Better Auth
secret. Web gates disabled Node's experimental web storage.

| Gate | Final result |
| --- | --- |
| Shared i18n full tests | Exit 0; 1 file, 13 tests passed. |
| Shared schemas full tests | Exit 0; 8 files, 76 tests passed. |
| API full tests | Exit 0; 48 files, 341 tests passed. |
| Web full tests | Exit 0; 81 files, 385 tests passed. |
| Aggregate test matrix | Exit 0; 138 files, 815 tests passed. |
| `pnpm lint` | Exit 0; 351 files checked; no fixes applied. |
| `pnpm typecheck` | Exit 0; i18n, shared, API, and web TypeScript projects passed. |
| `pnpm build` | Exit 0; API TypeScript and web Vite production builds completed. |
| `drizzle-kit check` | Exit 0; `Everything's fine` for existing migration snapshots. |
| Frozen lockfile | Exit 0; `pnpm install --lockfile-only --frozen-lockfile`. |
| Peer compatibility | Exit 0; `pnpm peers check` reported no peer dependency issues. |

The API suite printed its established development-email and monitoring-test diagnostics. The web
suite printed the documented pre-existing React suspended-resource `act(...)` notices. The build
printed a Node `module.register()` deprecation notice and the existing Vite chunk-size advisory. No
new branch-owned warning or error appeared.

A later aggregate rerun observed one intermittent, untouched locale-readiness test timing failure:
the readiness text rendered before two child query effects populated the request array. The exact
file immediately passed 5/5 in isolation, and the immediate full web rerun passed 81 files and 385
tests. The file and runtime boundary are outside this diff; no round-5 behavior depended on the
failed assertion.

## Targeted changed-surface coverage

Coverage used the V8 provider with text output and a `/tmp` report path; no coverage artifact was
added to the repository. The seven-file focused matrix again passed all 36 tests. Across the six
changed web runtime files it reached **97.65% statements/lines, 88.50% branches, and 85.71%
functions**. The new predicate, DirectoryLayout, RedirectIfAuthed, RequireAuth, and all changed
session-boundary statements reached 100% statement/line coverage. The lower WeekGrid function
percentage is from existing click/remove handlers outside this label-only change.

## Security, privacy, boundaries, and naming

- Better Auth remains the identity source; no client-supplied id was added to a request.
- Session id runtime input reaches only route/chrome decisions and the private-query identity. The
  central predicate validates its type and non-whitespace content before those sinks.
- Invalid identities become the distinguishable, existing anonymous `null` state; no exception is
  swallowed and no degraded authenticated fallback is introduced.
- Private session queries and mutations are cleared on the invalid-to-anonymous transition. Public
  catalog queries remain outside the session-query root allowlist.
- `isNonemptySessionUserId`, `rawUserId`, `cellFilledOne`, and `cellFilledOther` each describe their
  exact contents; no stale comment or renamed contract remains.
- No authenticated payload, session id, token, secret, email address, or authored content was added
  to logs, telemetry, persistence, or translated strings.

## Cleanup and sweeps

- Full diff was read top to bottom; every changed file is in the requested runtime, test, catalog,
  or report scope.
- Full diff check completed with no whitespace errors.
- Central-guard sweep found the predicate in exactly the four requested runtime consumers; no old
  `week.cellFilled` consumer or catalog key remains.
- Added-line secret scan found no key, token, private key, credentialed URL, or connection string.
- Added-line debug scan found no `.only`, `.skip`, `debugger`, trace logging, TODO, or FIXME.
- Scope sweep found no product-doc, approved-spec, plan, schema, migration, manifest, or lockfile
  change.
- Artifact sweep confirmed that no coverage, LCOV, build, cache, `.DS_Store`, or scratch artifact
  was added; ignored build outputs remain reproducible.
- No dependency, assertion, timeout, retry, lint rule, or test gate was loosened.

## Files changed

Runtime identity:

- `apps/web/src/lib/session-user-id.ts`
- `apps/web/src/lib/session-query-boundary.tsx`
- `apps/web/src/routes/require-auth.tsx`
- `apps/web/src/routes/redirect-if-authed.tsx`
- `apps/web/src/components/DirectoryLayout.tsx`

Week-grid localization:

- `apps/web/src/components/week/week-grid.tsx`
- `packages/i18n/src/en.ts`
- `packages/i18n/src/es.ts`

Regression tests:

- `apps/web/src/lib/session-query-boundary.test.tsx`
- `apps/web/src/routes/redirect-if-authed.test.tsx`
- `apps/web/src/components/DirectoryLayout.test.tsx`
- `apps/web/src/main.test.tsx`
- `apps/web/src/components/week/week-grid.test.tsx`
- `apps/web/src/routes/dog-week.test.tsx`

SDD evidence:

- `.superpowers/sdd/2026-08-23-end-to-end-localization/final-review-round-5-fix-report.md`

## Concerns

No unresolved round-5 identity, cache-boundary, redirect, directory-chrome, week-grid accessibility,
localization, data-preservation, migration, security/privacy, typecheck, or build concern remains.
The untouched locale-readiness effect-timing race described above is a separate FOLLOW-UP and is
explicitly out of scope for this two-finding change. Other observed notices are the established
diagnostics and build advisories described above.
