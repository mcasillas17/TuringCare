# Final dual-review round 6 fix report

Date: 2026-08-23

Starting commit: `a20f29c`

Scope source: `final-review-round-6-findings.md`

Runtime: Node `26.5.0`, pnpm `11.1.2`

## Outcome

All three verified round-6 findings are resolved. Finalized Brief generated-at chrome and PDF
models now use the shared explicit-UTC formatter with the Brief's stored locale. A near-midnight
UTC instant therefore retains its UTC calendar day for English and Spanish regardless of the
viewer's time zone.

The two readiness assertions that ran immediately after private children committed now wait for
the exact request condition. They do not sleep, widen a timeout, retry a production request, or
weaken an assertion.

All production web consumers of `useSession` were swept. `SiteNav`, `TrainerDetail`, the legacy
`LocaleAccountBridge`, `LocaleAccountBoundary`, `Profile`, the profile query hook, and the
authenticated email-verification banner now use the centralized nonempty-session-user-id
predicate. Previously compliant route, layout, and cache-boundary consumers remain unchanged.
Empty, whitespace-only, and non-string ids select anonymous/public behavior; valid ids retain the
authenticated behavior.

No product documentation, approved specification, plan, migration, schema, dependency metadata,
or lockfile changed. This report is the only SDD artifact added.

## Finding-by-finding resolution

| Finding | Resolution | Regression proof |
| --- | --- | --- |
| Viewer-local finalized Brief generated-at dates | Replaced the private Brief chrome formatter and PDF model formatter with `formatDateInUtc`. Locale selection remains driven by the stored Brief locale, with English only as the existing legacy-locale fallback. | Four near-midnight tests force `America/Los_Angeles` and verify UTC May 22 rather than local May 21 for English and Spanish chrome/PDF output. Existing owned/shared stored-locale tests remain green. |
| Immediate readiness request assertions | Wrapped the two post-commit request-locale assertions in Testing Library `waitFor` conditions over the exact expected arrays. Pre-readiness absence assertions remain immediate after an awaited profile/PATCH condition because their contract is that no child request has started. | The readiness file passes all 5 tests in focused and full-web runs; neither arbitrary sleeps nor test retries were introduced. |
| Session-object truthiness in authenticated public UI | Applied `isNonemptySessionUserId` in `SiteNav`, `TrainerDetail`, and legacy/current locale-account bridges. The production sweep also found the equivalent `VerifyEmailBanner` truthiness gate and the duplicated Profile/profile-query id guards; all now use the same predicate. `TrainerDetail` additionally requires the valid identity for the protected send-Brief CTA even if an inconsistent public payload contains contact email. | Component matrices cover `''`, whitespace, number, and existing valid `u1` behavior. Invalid ids show login/register/sign-up paths, suppress authenticated actions and verification UI, and start no profile request. |

## RED evidence

The production regression matrix was added before runtime edits and run against `a20f29c`. It
failed in 13 tests for the intended reasons:

- English and Spanish web chrome formatted `2026-05-22T00:30:00.000Z` as May 21 under a
  controlled Los Angeles viewer time zone.
- English and Spanish PDF models likewise formatted the same instant as May 21.
- Empty, whitespace-only, and numeric ids selected authenticated `SiteNav`, `TrainerDetail`, and
  email-verification behavior.

The readiness race was already reproduced by the immediately preceding aggregate round-5 run and
recorded in its fix report: readiness text committed before both child request effects populated
the array. This round stabilized the two exact assertions with condition waits; no artificial
sleep was needed or retained.

## Focused GREEN evidence

`NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @turingcare/web exec vitest run` over
Brief chrome/PDF, SiteNav, TrainerDetail, Profile/profile query, VerifyEmailBanner, locale-account
bridge, and locale-account readiness completed with exit 0: **9 files, 72 tests passed**.

## Full verification gates

The API test gate used the documented local PostgreSQL database and test-only Better Auth secret.
Web gates disabled Node's experimental web storage.

| Gate | Final result |
| --- | --- |
| Shared i18n full tests | Exit 0; 1 file, 13 tests passed. |
| Shared schemas full tests | Exit 0; 8 files, 76 tests passed. |
| API full tests | Exit 0; 48 files, 341 tests passed. |
| Web full tests | Exit 0; 82 files, 404 tests passed. |
| Aggregate full test matrix | Exit 0; 139 files, 834 tests passed. |
| `pnpm lint` | Exit 0; 352 files checked; no fixes applied. |
| `pnpm typecheck` | Exit 0; i18n, shared, API, and web TypeScript projects passed. |
| `pnpm build` | Exit 0; API TypeScript and web Vite production builds completed. |
| `drizzle-kit check` | Exit 0; `Everything's fine` for existing migration snapshots. |
| Frozen lockfile | Exit 0; `pnpm install --lockfile-only --frozen-lockfile`. |
| Peer compatibility | Exit 0; `pnpm peers check` reported no peer dependency issues. |

The API suite printed its established development-email and monitoring-test diagnostics. The web
suite printed the documented existing React suspended-resource `act(...)` notices. The build
printed the existing Node `module.register()` deprecation notice and Vite chunk-size advisory. No
new branch-owned warning or error appeared.

## Targeted changed-surface coverage

Coverage used the V8 provider with text output and `/tmp/turingcare-round-6-coverage` as its report
path; no coverage artifact was added to the repository. The nine-file focused matrix again passed
all 72 tests. Across the eight changed production files it reached **91.84% statements/lines,
83.83% branches, and 84.21% functions**. `SiteNav` and the PDF model reached 100% statements/lines;
remaining uncovered lines are existing unrelated form, error-toast, trainer-field, and locale
lifecycle branches.

## Session-consumer sweep and classification

- Already centralized and unchanged: `RequireAuth`, `RedirectIfAuthed`, `DirectoryLayout`, and
  `SessionQueryBoundary`.
- Named findings fixed: `SiteNav`, `TrainerDetail`, and the legacy `LocaleAccountBridge` export.
- Equivalent auth-sensitive truthiness fixed: `VerifyEmailBanner`.
- Equivalent duplicated id validation centralized: `LocaleAccountBoundary`, `Profile`, and
  `useProfile`.
- Not equivalent: the admin route checks a validated `/me` role response rather than session-object
  truthiness; data-presence checks in shared Brief/admin metrics are query-result state, not auth
  state.

No production `useSession` consumer retains session-object truthiness or a private non-trimming
session-id rule for auth-sensitive behavior.

## Security, privacy, boundaries, and naming

- Better Auth remains the identity source; the client still supplies no user id as request
  authority.
- Session runtime data is allowlisted as a string with at least one non-whitespace character at
  each changed auth-sensitive consumer. Invalid identities become the existing distinguishable
  anonymous state.
- `TrainerDetail` no longer exposes its authenticated send action from an inconsistent contact
  payload when the client session identity is malformed. The existing URL encoding for the email
  query parameter is unchanged.
- `VerifyEmailBanner` cannot initiate a resend from a malformed session identity. Email sending
  remains delegated to the existing auth client and server authorization path.
- Generated timestamps remain runtime data only; `formatDateInUtc` validates the date and React/PDF
  renderers receive localized text. Invalid PDF timestamps retain the existing raw distinguishable
  value, while invalid chrome timestamps remain omitted.
- `isAuthenticated`, `rawUserId`, `sessionUserId`, and `formatStoredBriefDate` accurately describe
  their values and have no hidden mutation or side effect.
- No authenticated payload, session id, token, secret, email address, or authored content was
  added to logs, telemetry, persistence, or translated strings.

## Cleanup and sweeps

- Compared the date change with the repository's existing `Overview` UTC formatter use and the
  identity change with `RequireAuth`/`DirectoryLayout`; adopted those shared mechanisms.
- Full diff was read top to bottom; every changed file is in requested runtime, regression-test, or
  report scope.
- Full diff check completed with no whitespace errors.
- Production session sweep found no remaining auth-sensitive session-object truthiness or duplicate
  weak user-id guard.
- Finalized Brief sweep found no remaining generated-at `Intl.DateTimeFormat` consumer outside the
  shared explicit-UTC formatter.
- Added-line secret scan found no key, token, private key, credentialed URL, or connection string.
- Added-line debug scan found no `.only`, `.skip`, `debugger`, trace logging, TODO, or FIXME.
- Scope sweep found no product-doc, approved-spec, plan, schema, migration, manifest, or lockfile
  change.
- Artifact sweep confirmed no coverage, LCOV, build, cache, `.DS_Store`, or scratch artifact was
  added; ignored build outputs remain reproducible.
- No dependency, assertion, timeout, retry, lint rule, or test gate was loosened.

## Files changed

Runtime:

- `apps/web/src/lib/brief-chrome.ts`
- `apps/web/src/lib/brief-pdf-model.ts`
- `apps/web/src/lib/profile.ts`
- `apps/web/src/components/landing/site-nav.tsx`
- `apps/web/src/components/verify-email-banner.tsx`
- `apps/web/src/i18n/locale-account-bridge.tsx`
- `apps/web/src/routes/profile.tsx`
- `apps/web/src/routes/trainer-detail.tsx`

Regression tests:

- `apps/web/src/lib/brief-chrome.test.ts`
- `apps/web/src/lib/brief-pdf-model.test.ts`
- `apps/web/src/components/landing/site-nav.test.tsx`
- `apps/web/src/components/verify-email-banner.test.tsx`
- `apps/web/src/i18n/locale-account-bridge.test.tsx`
- `apps/web/src/i18n/locale-account-readiness.test.tsx`
- `apps/web/src/routes/profile.test.tsx`
- `apps/web/src/routes/trainer-detail.test.tsx`

SDD evidence:

- `.superpowers/sdd/2026-08-23-end-to-end-localization/final-review-round-6-fix-report.md`

## Concerns

No unresolved round-6 generated-date stability, readiness timing, malformed-session UI,
localization, migration, security/privacy, typecheck, or build concern remains. The established
test/build notices described above are unchanged and outside this diff.
