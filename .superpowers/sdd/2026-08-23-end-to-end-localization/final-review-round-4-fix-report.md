# Final dual-review round 4 fix report

Date: 2026-08-23

Starting commit: `13834eb`

Scope source: `final-review-round-4-findings.md`

Runtime: Node `22.23.2`, pnpm `11.1.2`

## Outcome

All seven verified round-4 localization findings are resolved. Signed-in route and action
consumers now wait for account-locale readiness; Profile queries require a scoped, nonempty user
id; template preview state stores only a stable key; and every requested Overview, Progress,
Week, generated Brief, and admin-chart date/duration/status surface uses the selected or stored
locale without changing raw keys or authored content.

Resolved anonymous visitors still receive public routes while private cache cleanup runs. A
profile load or initial locale-save failure explicitly releases the signed-in boundary with
`local-fallback`, using the current allowlisted locale instead of hanging. Runtime-invalid session
ids cannot render protected route children.

No product documentation, approved specification, plan, migration, schema, training-catalog
content, stored authored content, email, PDF, telemetry, or dependency metadata changed. This
report is the only SDD artifact added.

## Finding-by-finding resolution

| Finding | Resolution | Regression proof |
| --- | --- | --- |
| 1. Account locale was not a readiness barrier | Added `LocaleAccountBoundary` and a readiness context with distinct `pending`, `signed-out`, `account`, and `local-fallback` states. Main routes and page-view actions are inside the boundary; authenticated route guards also check it. Signed-in children wait for session-cache cleanup, profile adoption, or initial preference persistence. Profile/PATCH failure releases the boundary with the current valid locale. Resolved signed-out children do not wait for private-cache cleanup. | With local `en` and deferred account `es`, only `/api/profile` is requested before resolution. Brief and template consumers mount afterward with `es` request headers and `account:es`. Empty account locale remains gated until the locale PATCH resolves. Profile failure renders `local-fallback:es`. Signed-out public content renders without a profile request, including while identity cleanup readiness is false. |
| 2. Optional/unscoped `useProfile` API | `useProfile` now requires `string \| null`, normalizes runtime input to a nonempty string or `null`, uses only `['profile', scopedUserId]`, enables only a valid id, and always passes a required expected id to the decoder. The response id must match exactly. Protected routing applies the same runtime fail-closed rule. | `null`, empty, whitespace-only, runtime `undefined`, and runtime numeric ids stay idle and make no request; no exact `['profile']` query is created. Mismatched and malformed responses remain uncached errors. Empty, whitespace-only, and numeric session ids redirect instead of rendering private content. |
| 3. Localized template object in picker state | Preview state now contains only `templateKey`. Every render derives the preview through `findCatalogTemplate` against the current locale catalog; apply continues to submit the stable key. A missing current key safely returns to the picker control. | Open English preview, switch to Spanish, and the preview changes to Spanish before applying the unchanged `basic-manners` key. |
| 4. Raw Overview status and ISO activity dates | Known Brief statuses map to existing `brief.draft`/`brief.finalized` catalog keys, with unknown stable values preserved. Activity dates use the selected locale through the shared UTC formatter; malformed dates are omitted rather than exposed raw. | Explicit Spanish with browser English renders `Definitivo` and `19 de mayo de 2026`, with neither `finalized`, ISO text, nor the shifted prior day visible. |
| 5. Progress/Week browser-default dates and literal units | Added catalog minute singular/plural units. Progress last-session, session, and milestone dates use selected-locale UTC formatting. Week range/header/ARIA dates format stable day keys in UTC; popup durations use catalog units. Existing local wall-clock session times, raw grouping keys, callbacks, and authored notes remain unchanged. | Spanish/browser-English tests cover a near-midnight UTC instant, visual dates, full screen-reader date labels, and `12 minutos`; no raw ISO, `12m`, hardcoded `min`, or shifted `May 18` output remains. |
| 6. English generated Brief ISO dates | API Brief entry and reached dates use the stored/request `Locale` through `formatDateInUtc`; English and Spanish formats are explicit. Invalid internal Brief dates fail loudly instead of leaking raw date text. Spanish punctuation normalization is preserved. | English artifacts contain `May 18, 2026` and `reached Jun 3`; Spanish artifacts contain `18 may 2026` and `alcanzado 3 jun` for `00:30Z` instants in a Pacific test environment. Entry capping remains ten localized lines. |
| 7. Raw admin chart buckets | Added a narrow admin chart label helper and supplied it to every requested Recharts `XAxis.tickFormatter` and `Tooltip.labelFormatter` in Growth, Active Usage, and both Events Over Time chart branches. `buildSeries` and its raw day/Monday bucket keys are untouched. | Recharts prop-behavior tests feed `2026-05-19` under Spanish and observe `19 may` for axes/tooltips while stable series data keys and raw aggregation tests remain green. |

## Readiness lifecycle

1. An unresolved session renders the localized loading state, preventing a signed-in consumer from
   issuing locale-sensitive requests before identity is known.
2. A resolved anonymous session renders public children immediately with `signed-out`, even while
   the separate private-cache cleanup boundary finishes.
3. A valid signed-in identity first waits for session-bound query cleanup, then loads only its
   exactly scoped Profile record.
4. If the account has a locale and no newer explicit local selection exists, the provider adopts
   it. Children mount only after the adopted locale is observable.
5. If the account locale is empty, or an explicit selection superseded the loading profile, the
   current locale is persisted. Children mount only after the latest desired locale is confirmed.
6. A profile load failure or latest initial persistence failure releases children as
   `local-fallback`, retaining the current allowlisted locale. It never leaves the route pending
   forever.
7. User switches remount the authenticated readiness state by user id. Existing stale-response and
   out-of-order-mutation protections remain intact.

The readiness context defaults to ready/signed-out only for isolated consumers outside the main
boundary; main production routes always receive the explicit boundary value.

## Locale and date policy

`formatDateInUtc(locale, value, options)` is the shared narrow primitive. It validates the date,
forces `timeZone: 'UTC'`, and returns `null` for invalid input. This is used for persisted calendar
dates and stable storage day keys so `00:30Z` does not display as the prior day on a Pacific host.
The selected UI locale drives web labels; generated Briefs receive the request/stored Brief locale.

Local-time journal grouping and capture helpers were intentionally not changed. Week aggregation
continues to use the existing local Monday/week calculations and stable `YYYY-MM-DD` keys; only the
presentation layer formats those keys. Admin event aggregation likewise remains byte-for-byte in
`events-series.ts`.

## RED evidence

Every requested behavior group was observed failing before its production change. Later audit
edges were also taken through RED before correction.

| Group | RED result |
| --- | --- |
| Readiness boundary plus strict Profile scope | Exit 1; 8 failed, 3 passed. Invalid ids fetched or created fail-open state, and the old bridge did not render/gate children. |
| Template stable-key preview | Exit 1; 1 failed, 5 passed. English preview content remained after switching to Spanish. |
| Shared deterministic date helper | Exit 1; 1 failed, 12 passed. The helper did not yet exist. |
| Overview status/date localization | Exit 1; 1 failed, 5 passed. Raw `finalized` and the ISO date rendered. |
| Progress and Week display/ARIA localization | Exit 1; 2 failed, 5 passed. Progress used browser-local `May 18`; Week exposed raw `2026-05-18` and literal duration output. |
| Generated Brief dates | Exit 1; 4 failed, 3 passed. English remained ISO and near-midnight English/Spanish dates shifted. |
| Admin chart axis/tooltip labels | Exit 1; 3 failed, 10 passed. All three chart surfaces received raw date buckets. |
| Resolved-anonymous public availability audit | Exit 1; 1 failed, 4 passed. The boundary showed `Loading…` while identity readiness was false. |
| Runtime-invalid protected identity audit | Exit 1; 3 failed, 2 passed. Empty, whitespace, and numeric ids rendered private children. |

## Focused GREEN evidence

| Surface | Result |
| --- | --- |
| Initial readiness/Profile/main/guards matrix | Exit 0; 6 files, 32 tests. |
| Readiness, identity cleanup, main, and guards after public-route audit | Exit 0; 6 files, 28 tests. |
| Final invalid-id guard/readiness/main matrix | Exit 0; 3 files, 12 tests. |
| Template picker | Exit 0; 1 file, 6 tests. |
| Shared i18n helper/catalog parity | Exit 0; 1 file, 13 tests. |
| Overview | Exit 0; 1 file, 6 tests. |
| Progress, milestone, and Week | Exit 0; 3 files, 9 tests. |
| Generated Brief | Exit 0; 1 file, 7 tests. |
| Admin charts plus raw aggregation | Exit 0; 3 files, 16 tests. |

## Security, privacy, and data trace

- Better Auth session data remains the identity authority. No user id was added to request input.
- Profile JSON remains untrusted: object shape, scalar fields, allowlisted nullable locale, and
  exact expected user id are checked before React Query can cache it.
- Disabled/invalid Profile input cannot invoke the API, including a manual query-function path.
- Runtime-invalid session ids cannot render protected children.
- Locale values still come only from the existing `en`/`es` allowlist. The readiness status carries
  no user content and is not sent over the network.
- No authenticated payload, authored note, token, secret, email address, or contact detail was
  added to logging, telemetry, storage keys, or query keys.
- Raw event/date aggregation keys, training template keys, authored goal/skill/session text, Brief
  summaries, and database values are preserved.

## Implementation comparison

The new formatter was compared against `apps/web/src/lib/when.ts`, which was opened in this
session. That module intentionally formats journal timeline/capture instants in local time. Reusing
it for persisted calendar days would retain the observed prior-day shift. The UTC helper therefore
stays separate and explicit rather than changing the existing journal semantics.

Overview status mapping was compared against the opened `apps/web/src/lib/brief-pdf-model.ts`
mapping. Both preserve unknown raw values and translate only known stable enums, so the same shape
was retained. Admin display formatting was also checked against `events-series.ts`; keeping the
formatter exclusively in chart props avoids changing aggregation, sorting, or stored keys.

## Full verification gates

All final commands used Node `22.23.2`. API tests used the documented local PostgreSQL test
database and test-only Better Auth secret. Web commands used
`NODE_OPTIONS=--no-experimental-webstorage`.

| Gate | Final result |
| --- | --- |
| Shared i18n full tests | Exit 0; 1 file, 13 tests passed. |
| Shared schemas full tests | Exit 0; 8 files, 76 tests passed. |
| API full tests | Exit 0; 48 files, 341 tests passed. |
| Web full tests | Exit 0; 80 files, 368 tests passed. |
| Aggregate test matrix | Exit 0; 137 files, 798 tests passed. |
| `pnpm lint` | Exit 0; 349 files checked; no fixes applied. |
| `pnpm typecheck` | Exit 0; i18n, shared, API, and web TypeScript projects passed. |
| `pnpm build` | Exit 0; API TypeScript and web Vite production builds completed. |
| `drizzle-kit check` | Exit 0; `Everything's fine` for existing migration snapshots. |
| Frozen lockfile | Exit 0; `pnpm install --lockfile-only --frozen-lockfile`. |
| Peer compatibility | Exit 0; `pnpm peers check` reported no peer dependency issues. |

The API suite printed its established development-email and monitoring-test diagnostics. The web
suite printed the documented pre-existing React suspended-resource `act(...)` notices. The build
printed the documented existing Vite chunk-size advisory. No new branch-owned warning or error
appeared.

## Targeted changed-surface coverage

Coverage used the V8 provider with text output and `/tmp` report paths; no coverage artifact was
added to the repository.

| Surface | Result |
| --- | --- |
| Web readiness/Profile/main/guards/template/Overview/Progress/Week/admin charts | Exit 0; 14 files, 74 tests. Across 15 changed source files: 90.05% statements/lines, 81.76% branches, 67.90% functions. Readiness reached 96.27% statements and 97.22% branches; chart production files reached 100% statements/lines/functions. |
| API generated Brief | Exit 0; 1 file, 7 tests. `brief.ts`: 99.47% statements/lines, 86.95% branches, 100% functions. |
| Shared i18n helper/runtime | Exit 0; 1 file, 13 tests. `index.ts`: 100% statements/lines/functions, 80.95% branches. |

The lower web function percentage is from pre-existing uninvoked form/mutation handlers in the
included large Progress and Dog Week components. Requested readiness, locale-switch, visual/ARIA,
chart-prop, and generated-artifact branches are directly exercised.

## Cleanup and sweeps

- Full diff was read top to bottom after the final source change; every file is in requested scope.
- Full diff check: exit 0; no whitespace errors.
- Added-line secret scan: no key, token, private-key, credentialed URL, or connection-string match.
- Added-line debug scan: no `.only`, `.skip`, `debugger`, trace logging, TODO, or FIXME.
- Unscoped Profile sweep: no zero-argument call, optional decoder identity, or legacy query-key
  helper remains.
- Localized-surface sweep: no browser-default date formatter, ISO slice, `durationMinutes}m`, or
  literal `durationMinutes} min` pattern remains in the requested surfaces.
- Template-state sweep: no localized `CatalogTemplate` object is stored in preview state.
- Admin chart sweep: all four date axes and four tooltips have locale-aware formatters.
- Scope sweep: approved spec, plan, product docs, migration, manifests, and lockfile are untouched.
- Artifact sweep: no repository coverage, LCOV, `.DS_Store`, or scratch artifact was added. The
  stale Vite-cache backup created during the initial stale-state ladder was moved to Trash and is
  recoverable; generated caches are reproducible.
- Cleanup kept the regression tests and narrow formatting/readiness helpers because they guard the
  same failure classes. No dependency, timeout, retry, assertion, or lint rule was loosened.

## Files changed

API generated artifact:

- `apps/api/src/lib/brief.ts`
- `apps/api/src/lib/brief.test.ts`

Web readiness, identity, and application boundary:

- `apps/web/src/i18n/locale-account-bridge.tsx`
- `apps/web/src/i18n/locale-account-readiness.test.tsx`
- `apps/web/src/lib/profile.ts`
- `apps/web/src/lib/profile.test.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/main.test.tsx`
- `apps/web/src/routes/require-auth.tsx`
- `apps/web/src/routes/require-auth.test.tsx`
- `apps/web/src/routes/admin/require-admin.tsx`

Web localized presentation:

- `apps/web/src/components/training/template-picker.tsx`
- `apps/web/src/components/training/template-picker.test.tsx`
- `apps/web/src/routes/overview.tsx`
- `apps/web/src/routes/overview.test.tsx`
- `apps/web/src/components/progress/progress-panel.tsx`
- `apps/web/src/components/progress/progress-panel.test.tsx`
- `apps/web/src/components/progress/milestone-stepper.tsx`
- `apps/web/src/components/week/week-grid.tsx`
- `apps/web/src/routes/dog-week.tsx`
- `apps/web/src/routes/dog-week.test.tsx`
- `apps/web/src/routes/admin/panels/chart-date.ts`
- `apps/web/src/routes/admin/panels/growth.tsx`
- `apps/web/src/routes/admin/panels/active-usage.tsx`
- `apps/web/src/routes/admin/panels/events-over-time.tsx`
- `apps/web/src/routes/admin/panels/events-over-time.test.tsx`
- `apps/web/src/routes/admin/panels/panels.test.tsx`

Shared locale catalog/helper:

- `packages/i18n/src/en.ts`
- `packages/i18n/src/es.ts`
- `packages/i18n/src/index.ts`
- `packages/i18n/src/index.test.ts`

SDD evidence:

- `.superpowers/sdd/2026-08-23-end-to-end-localization/final-review-round-4-fix-report.md`

## Concerns

No unresolved round-4 localization, readiness, identity-scope, data-preservation, migration,
security, privacy, test, typecheck, or build concern remains. The only observed notices are the
documented pre-existing API test diagnostics, React test `act(...)` messages, and Vite chunk-size
advisory described above.
