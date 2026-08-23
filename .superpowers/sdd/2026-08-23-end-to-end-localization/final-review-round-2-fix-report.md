# Final dual-review round 2 fix report

Date: 2026-08-23

Starting commit: `bbbc5d5`

Scope source: `final-review-round-2-findings.md`

Runtime: Node `22.23.2`

## Outcome

All seven verified round-2 findings are resolved. The implementation now derives locale
account synchronization directly from the current Better Auth session identity, separates
explicit locale selection from automatic account adoption, rejects malformed remote locale
data before it reaches any locale sink, clears private React Query state at authenticated
identity transitions, normalizes every API Zod issue to an allowlisted stable code, and makes
the existing language control reachable from the admin shell.

No product documentation, deployment documentation, project log, approved spec/plan,
migration, telemetry, email, PDF, stored-Brief, parser, training catalog, or catalog resource
was changed in this wave. This report is the only SDD artifact added.

## Finding-by-finding resolution

| Finding | Resolution | Regression proof |
| --- | --- | --- |
| 1. Bridge identity and stale async work | `LocaleAccountBridge` now reads the non-empty `session.user.id` directly from Better Auth, waits for the central identity boundary, and renders an authenticated inner bridge keyed by that id. It no longer calls `/me`. The keyed inner owns all initialization and mutation refs. Its layout-effect lifetime flag prevents an old user's success, retry, rejection, cache effect, or toast from affecting the newly mounted user. Locale mutation success no longer writes or invalidates profile/`me` cache. | Actual `useSession` user A → user B transition; distinct profile requests/locale adoption; no `/me`; old-user mutation resolution and rejection after the switch; no retry, state change, cache write, or toast in the new session. |
| 2. Explicit selection while profile is pending | The provider exposes `selectLocale` for user intent and `adoptLocale` for automatic initialization. Only explicit selection increments `explicitSelectionRevision`. Each keyed bridge snapshots that revision at mount; if it changes before profile resolution, the selected UI locale wins and is PATCHed once the profile arrives instead of being replaced by the stored account locale. | Deferred profile request, keyboard/click toggle before resolution, then profile resolution: UI/storage remain Spanish and one Spanish PATCH is sent. Automatic account adoption still sends no PATCH. |
| 3. Runtime locale validation | `setActiveLocale`, `selectLocale`, and `adoptLocale` accept `unknown` and commit only after `isLocale` succeeds. `decodeProfileResponse` validates response/object/user shape, session-matching id, name, email, and nullable allowlisted locale. `decodeProfileLocaleResponse` validates the mutation locale. `ProfileResponseError` exposes stable `invalid_profile_response` and `invalid_profile_locale_response` failure codes. Invalid values never reach React state, local storage, `<html lang>`, the active-locale header store, or translation lookup. | Invalid provider input leaves every sink English; malformed profile locale puts the keyed query into a distinguishable error state with no cache value/PATCH; malformed PATCH response rejects once, preserves local Spanish, and emits one localized persistence error. |
| 4. Private cache isolation | One `SessionQueryBoundary` sits directly under the existing `QueryClientProvider`/`LocaleProvider`. On the initial resolved identity and every login, logout, or user switch it gates authenticated consumers, cancels/removes every session-bound query root, clears mutation records, and only then marks that identity ready. `RequireAuth`, `RequireAdmin`, `DirectoryLayout`, and the locale bridge consume the gate. Public routes continue rendering during sanitization. | A single `QueryClient` is seeded with profile, dogs-overview, and overview data across user switch/logout/login. Each private entry is removed before readiness while the public landing content and `training-catalog` cache survive. A direct `RequireAuth` regression proves children stay unmounted until identity sanitization is ready. |
| 5. Stable API validation codes | Shared validation adds allowlisted `validation.invalid` plus `normalizeValidationMessageCode`. The API's `stableZValidator` delegates parsing to the installed Hono validator and normalizes only failed issue messages before its ordinary 400 serialization. All production Hono schema validators now use that boundary. Existing explicit codes are preserved; uncoded defaults become `validation.invalid`; API output is never translated prose. | Explicit-code preservation plus max-length, date, UUID, numeric-type, enum, and strict-extra-field cases. English- and Spanish-header requests return identical arrays containing only allowlisted `validation.*` codes. |
| 6. Missing lifecycle/race/malformed coverage | Added focused tests for actual session-id transitions, stale old-user mutation success/rejection, toggle-before-profile, malformed profile/mutation bodies, profile identity mismatch, guarded active/provider setters, explicit active-locale reset, central private-cache lifecycle, and auth-gate readiness. | The new tests fail for the original implementation, pass for the fix, and are included in the 348-test web suite. |
| 7. Admin language control | `AdminShell` mounts the existing `LanguageToggle` in its header after sign-out, separated visually without changing nav destinations or labels. | Starting in Spanish, keyboard Enter opens `Idioma`, focuses `Cambiar a English`, selects it with Enter, then exposes the English `Language` label while the Dashboard link remains `/admin`. |

## RED evidence

The behavior tests were added and run against the unmodified affected production code before
each implementation group. All REDs were assertion failures for the requested behavior, not
compile failures.

### Locale state and provider contract

```sh
PATH=<node22> NODE_OPTIONS=--no-experimental-webstorage \
  pnpm --filter @turingcare/web exec vitest run \
  src/i18n/active-locale.test.ts src/i18n/i18n.test.tsx
```

RED: 2 test files failed; 3 tests failed and 13 passed. The original runtime lacked a reset,
accepted an invalid provider locale, and had no explicit-selection/adoption distinction.

### Session-keyed bridge, races, and response decoders

```sh
PATH=<node22> NODE_OPTIONS=--no-experimental-webstorage \
  pnpm --filter @turingcare/web exec vitest run \
  src/i18n/locale-account-bridge.test.tsx src/lib/profile.test.tsx
```

RED: 2 test files failed; 8 tests failed and 8 passed. Failures demonstrated the static
identity path, pending-profile overwrite, missing persistence, malformed profile/mutation
acceptance, and old-user completion/rejection effects.

### Central authenticated query boundary

```sh
PATH=<node22> NODE_OPTIONS=--no-experimental-webstorage \
  pnpm --filter @turingcare/web exec vitest run src/main.test.tsx
```

RED: 1 test failed and 1 passed. Seeded profile, dogs-overview, and overview values remained
on the same `QueryClient` instead of being removed at resolved identity.

### API validation normalization

```sh
PATH=<node22> DATABASE_URL=<local-test-db> BETTER_AUTH_SECRET=<test-only> \
  pnpm --filter @turingcare/api exec vitest run src/validation-contract.test.ts
```

RED: 6 tests failed and 1 passed. Default max/date/UUID/numeric/enum/strict-field issues
contained Zod's English prose instead of `validation.invalid`; the explicit coded issue
already passed.

### Admin language reachability

```sh
PATH=<node22> NODE_OPTIONS=--no-experimental-webstorage \
  pnpm --filter @turingcare/web exec vitest run \
  src/components/admin-shell/AdminShell.test.tsx
```

RED: 1 test failed and 4 passed because no accessible `Idioma` button existed in the admin
shell.

## Focused GREEN evidence

| Surface | Command/result |
| --- | --- |
| Active locale/provider/bridge/profile decoder | Focused web Vitest run of `active-locale`, `i18n`, `locale-account-bridge`, and `profile`: exit 0; 4 files, 32 tests passed. |
| Identity boundary and route gates | Focused boundary/main/directory/admin/auth-gate runs: exit 0. The final coverage run exercised 11 files and 54 tests, all passed. |
| API validation contract | `vitest run src/validation-contract.test.ts`: exit 0; 1 file, 7 tests passed. |
| Admin language interaction | `vitest run src/components/admin-shell/AdminShell.test.tsx`: exit 0; 1 file, 5 tests passed. |
| Shared normalization helper | `vitest run src/validation.test.ts`: exit 0; 1 file, 27 tests passed. |

A broader web-focused run initially found two failures in the pre-existing Profile route test:
its synthetic profile response omitted the now-required `locale` field. That fixture was
corrected to model the API contract (`locale: null`); the route test then passed 2/2. No
production decoder was weakened to accommodate the malformed fixture.

## Locale and bridge lifecycle

1. `LocaleProvider` detects an allowlisted initial locale and synchronously activates it before
   child render, so the first child commit sees the correct document language and request locale.
2. `selectLocale` represents explicit user intent; `adoptLocale` represents an automatic account
   decision. Both validate before committing, but only selection increments the intent revision.
3. The framework-neutral active-locale singleton remains the source used by `localeFetch` when
   storage access fails. `resetActiveLocale` gives tests and other isolated runtimes an explicit
   reset; every provider initialization also overwrites it with a newly detected valid locale.
4. Once the session boundary resolves a non-empty Better Auth user id, a keyed bridge requests
   `['profile', userId]`. A stored account locale is adopted only if no explicit selection occurred
   during that profile request; otherwise the explicit selected value is persisted.
5. Later explicit toggles persist to the current account. Out-of-order responses reconcile toward
   the latest desired locale. Unmount/session switch makes every old inner callback inert for UI,
   cache, retry, and toast purposes.
6. Logout removes the bridge. Login or user switch cannot mount a new inner until private query
   sanitization has completed for the resolved identity.

## Query/resource-key architecture

Session-bound query roots are centralized in `SESSION_QUERY_ROOTS`:

```text
admin, brief, brief-sends, dog-journal, dogs, dogs-overview, focus, journal,
me, onboarding, overview, profile, progress
```

The profile query remains additionally keyed by the actual session user id. Public resources are
intentionally retained across identity transitions: `training-catalog` (already locale-keyed),
`courses`, `course`, `trainers`, and token-keyed `shared-brief`. The boundary predicate examines
only the first key segment, so all descendants of a private root are removed atomically without
enumerating dog/profile identifiers.

The shared `@turingcare/i18n` English/Spanish resource catalogs and recursive parity contract are
unchanged in this wave. Admin reuses the existing catalog-backed `LanguageToggle`; no duplicate
admin-specific strings or fixed resources were introduced.

Comparison check: the pre-fix `apps/web/src/lib/profile.ts` already used a user-id suffix on the
profile key. Applying that pattern to every private hook would prevent selecting another user's
entry but would leave the old user's private data resident and require identity plumbing across
every call site. The central boundary adds one identity transition gate and removes the resident
private data, which directly satisfies the privacy requirement, so the centralized design was
kept. For validation, the installed
`apps/api/node_modules/@hono/zod-validator/dist/index.js` was opened: its hook runs after
`safeParseAsync` and immediately before the default failure JSON. `stableZValidator` adapts that
existing hook rather than duplicating parsing or installing a global Zod error map, preserving
normal success types and avoiding global/web evaluation-order effects.

## Validation error contract

The shared allowlist remains the sole authority for messages that may be presented as validation
keys. It now includes the generic stable code:

```json
{
  "message": "validation.invalid"
}
```

At API boundaries:

- known explicit codes such as `validation.nameRequired` pass through unchanged;
- every unknown/default Zod message becomes `validation.invalid`;
- issue order, path, code, and other Zod metadata are preserved;
- request locale does not change the API payload;
- the API never translates a validation code to user-facing prose.

The existing web render boundary still translates only allowlisted validation codes and uses its
localized generic fallback for unknown/default messages. This wave does not broaden that
allowlist boundary or render raw API/Zod prose.

## Security and privacy trace

- Authentication authority remains Better Auth session state in the browser and existing
  server-side authentication middleware in the API. No client-supplied user id was added to a
  request body, query string, or header.
- Remote profile JSON is treated as untrusted. The decoder validates the object shape, consumed
  scalar fields, session-matching identity, and locale allowlist before returning cacheable data.
- Remote mutation JSON is treated as untrusted. Only an allowlisted returned locale is accepted;
  malformed success bodies reject as a stable typed failure.
- Invalid locale values are stopped before every sink: React state, storage, document metadata,
  active request headers, and translation lookup.
- During identity changes, private consumers are gated before effect-driven cache removal. Old
  profile/dog/overview data cannot render for the next identity, and public route rendering is not
  coupled to the sanitization operation.
- Old-user locale callbacks cannot update the new bridge, cache, DOM, storage, or toast. A request
  already accepted under user A may still finish server-side for user A, but its client callback is
  inert after the keyed bridge unmounts.
- Validation normalization reduces server output to stable allowlisted codes and retains no raw
  request values in new logging. No telemetry or logging path changed.
- No HTML/PDF/email generation path changed. Existing escaping and stored-artifact language
  behavior remain untouched.
- The final added-line secret scan found only the deliberate `password-123` validation fixture;
  no key, token, connection string, private endpoint, or real credential was added.

## Full verification gates

All commands used Node 22. API commands used the documented local test database and test-only
Better Auth secret. Web commands disabled experimental Node web storage.

| Gate | Final result |
| --- | --- |
| Shared i18n full tests | Exit 0; 1 file, 12 tests passed. |
| Shared schemas full tests | Exit 0; 8 files, 76 tests passed. |
| API full tests | Exit 0; 48 files, 339 tests passed against local PostgreSQL. |
| Web full tests | Exit 0; 79 files, 348 tests passed. |
| `pnpm lint` | Exit 0; 347 files checked, no fixes required. |
| `pnpm typecheck` | Exit 0; i18n, shared, API, and web TypeScript projects passed. |
| `pnpm build` | Exit 0; API TypeScript build and web Vite production build completed. |
| `drizzle-kit check` | Exit 0; `Everything's fine` for the existing migration snapshots. |
| `git diff --cached --check` | Exit 0; no whitespace errors. |

The API suite printed its established dev-email/monitoring-test diagnostics. The web suite printed
the documented pre-existing React suspended-resource `act(...)` notices. The build printed the
documented existing Vite chunk-size advisory. No new branch-owned warning or error was present.

## Targeted changed-surface coverage

| Surface | Result |
| --- | --- |
| Web locale/bridge/profile/session-boundary/admin/auth-gate/main surface | Exit 0; 11 test files, 54 tests. 91.40% statements, 87.24% branches, 80.00% functions, 91.40% lines across the explicit changed-file include set. `active-locale.ts`, `locale-account-bridge.tsx`, and `session-query-boundary.tsx` reached 100% statements/lines/functions; `require-auth.tsx` reached 100%; `main.tsx` reached 97.60% statements/lines. |
| API `stableZValidator` boundary | Exit 0; 5 test files, 97 tests; 100% statements, branches, functions, and lines for `src/middleware/validation.ts`. |
| Shared validation normalization | Exit 0; 1 test file, 27 tests; 100% statements, branches, functions, and lines for `src/validation.ts`. |

Coverage reports were directed to `/tmp/turingcare-r2-*-coverage`; no coverage output was added to
the repository.

## Files changed

API behavior and contract:

- `apps/api/src/middleware/validation.ts`
- `apps/api/src/app.ts`
- `apps/api/src/routes/admin-courses.ts`
- `apps/api/src/routes/admin-trainers.ts`
- `apps/api/src/routes/dogs.ts`
- `apps/api/src/routes/profile.ts`
- `apps/api/src/validation-contract.test.ts`

Web runtime and route gates:

- `apps/web/src/i18n/active-locale.ts`
- `apps/web/src/i18n/index.tsx`
- `apps/web/src/i18n/locale-account-bridge.tsx`
- `apps/web/src/lib/profile.ts`
- `apps/web/src/lib/session-query-boundary.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/routes/require-auth.tsx`
- `apps/web/src/routes/admin/require-admin.tsx`
- `apps/web/src/components/DirectoryLayout.tsx`
- `apps/web/src/components/LanguageToggle.tsx`
- `apps/web/src/components/admin-shell/AdminShell.tsx`

Web regressions and adjusted fixtures:

- `apps/web/src/i18n/active-locale.test.ts`
- `apps/web/src/i18n/i18n.test.tsx`
- `apps/web/src/i18n/locale-account-bridge.test.tsx`
- `apps/web/src/lib/profile.test.tsx`
- `apps/web/src/lib/session-query-boundary.test.tsx`
- `apps/web/src/main.test.tsx`
- `apps/web/src/routes/require-auth.test.tsx`
- `apps/web/src/components/admin-shell/AdminShell.test.tsx`
- `apps/web/src/lib/api.test.ts`
- `apps/web/src/lib/training-catalog.test.tsx`
- `apps/web/src/routes/profile.test.tsx`

Shared contract:

- `packages/shared/src/validation.ts`
- `packages/shared/src/validation.test.ts`

Report:

- `.superpowers/sdd/2026-08-23-end-to-end-localization/final-review-round-2-fix-report.md`

## Final sweeps and cleanup

- Production `LocaleAccountBridge` mounts: exactly one (`apps/web/src/main.tsx`).
- Bridge `/me`, `useMe`, and `['me']` identity searches: zero hits in the bridge; the full bridge
  file was read and its sole identity input is `useSession`.
- Raw API `zValidator` imports/calls: only the centralized `middleware/validation.ts` wrapper.
- Legacy `setLocale` symbol: zero TypeScript/TSX hits; explicit and automatic APIs are named
  `selectLocale` and `adoptLocale`.
- Added `.only`, `.skip`, focused suites, debugger/trace console calls, TODO/FIXME markers,
  ignored checks, and relaxed thresholds/timeouts: zero.
- Manifest and lockfile changes: zero; no dependency was added.
- Product docs, spec/plan, prior SDD reports, migration, telemetry, and monitoring changes: zero.
- `git diff --cached --check`: clean.
- Debugging residue removed: test caches/build output were not staged; targeted coverage lives only
  under `/tmp`. Kept the new tests and decoder/error types because they guard the same lifecycle,
  privacy, malformed-input, and validation-contract failure classes for future changes.

## Concerns and maintenance notes

- No branch-owned functional concern remains.
- The central private-root set must be extended when a future authenticated query introduces a new
  first key segment. Keeping the list in one module makes that maintenance point explicit and
  reviewable.
- Existing React test `act(...)` notices and the Vite chunk-size advisory remain outside this
  localization fix wave; neither was introduced or worsened here.
