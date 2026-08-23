# Final dual-review round 3 fix report

Date: 2026-08-23

Starting commit: `cb9a780`

Scope source: `final-review-round-3-findings.md`

Runtime: Node `22.23.2`

## Outcome

All five verified round-3 findings are resolved. The Profile route now scopes and decodes its
response against the current Better Auth session user, the web uses one active i18next runtime
through React-i18next, stored Brief headings carry their stored language metadata, authenticated
trainer contact cache is removed on every identity transition, and malformed JSON returns the
same locale-independent stable validation-code payload as schema validation.

No product documentation, deployment documentation, project log, approved specification, plan,
migration, catalog resource, email, PDF, telemetry, or database schema was changed. This report is
the only SDD artifact added.

## Finding-by-finding resolution

| Finding | Resolution | Regression proof |
| --- | --- | --- |
| 1. Profile route identity binding | `Profile` reads the non-empty current `useSession()` user id and passes it to `useProfile(userId)`. Pending session state keeps the route loading; missing identity becomes the localized safe load error. The existing decoder now receives the expected id, rejects a mismatched response as `invalid_profile_response`, and React Query never stores that response as data under either a keyed or legacy unscoped profile key. | Session user `u1` with a successful-looking `u2` profile response displays only the generic load error. The other user's name/email never render and neither `['profile', 'u1']` nor `['profile']` contains data. |
| 2. React-i18next integration | Added compatible `react-i18next` `16.6.6`. One module-owned `WEB_I18N` instance is initialized from the shared `@turingcare/i18n` catalogs and passed through one `I18nextProvider`. Initial detection synchronously activates the active request locale, `i18n.language`, and `<html lang>` before children render; later selection/adoption runs the same activation path. The typed `useI18n().t` facade is now built from React-i18next's `useTranslation()` function instead of selecting a parallel private instance. The framework-neutral `translate(locale, ...)` utility uses `getFixedT(locale)` on the same runtime without mutating its active language. | A direct `useTranslation()` consumer renders English with `i18n.language === 'en'`, then renders Spanish with `i18n.language === 'es'` after the existing locale selector runs. Existing first-child document-language, storage-denied state, active request-locale, malformed-locale, facade rerender, and catalog parity tests remain green. |
| 3. Stored Brief title metadata | The shared Brief heading receives `lang={normalizeBriefLocale(data.locale)}`. The article retains its existing stored-locale `lang`, so both the shared title and body are correctly identified even when the surrounding UI document uses the opposite locale. | English UI plus stored Spanish Brief asserts `lang="es"` on the Spanish heading and article, Spanish version chrome, and Spanish PDF handoff. |
| 4. Trainer contact cache privacy | Added the mixed public/authenticated `trainers` query root to the central session-bound query set. The existing identity boundary cancels and removes all descendants before it marks the new login/logout/user-switch identity ready. This includes `['trainers', id]`, whose authenticated response can contain email and phone. Public route children continue rendering while sanitization runs; only the affected cache is removed and may refetch. | A single `QueryClient` renders cached authenticated email/phone for user `u1`, transitions to logout, then proves the contact disappears from both DOM and query data before anonymous readiness. Existing profile/dogs/overview lifecycle and retained public training-catalog coverage remains green. |
| 5. Malformed JSON validation contract | The API recognizes Hono's exact 400 malformed-JSON `HTTPException` at the central error boundary and replaces its text response with the stable validation result. This branch runs before ordinary HTTP exception preservation and is neither captured nor logged as an unexpected server failure. The installed Hono source was inspected: JSON parsing occurs before the Zod validator hook, so the boundary is the first common normalization point without reimplementing body parsing or weakening validator types. | Malformed registration JSON under both `en` and `es` returns JSON status 400 with only `validation.invalid`; neither response contains Hono's English parser prose. All representative Zod/default and explicit-code contract tests remain green. |

## RED evidence

`react-i18next` was added first as test-compilation setup. No web provider/runtime behavior or
other production source had changed when the five regression groups were run. Every RED was an
assertion failure demonstrating the requested missing behavior rather than a setup, compile, or
environment failure.

### Profile identity

```text
PATH=<node22> NODE_OPTIONS=--no-experimental-webstorage
pnpm --filter @turingcare/web exec vitest run src/routes/profile.test.tsx
```

Exit 1: 1 failed, 2 passed. The response for `u2` rendered `other@example.com` instead of the
generic profile load error.

### React-i18next runtime

```text
PATH=<node22> NODE_OPTIONS=--no-experimental-webstorage
pnpm --filter @turingcare/web exec vitest run src/i18n/i18n.test.tsx
```

Exit 1: 1 failed, 14 passed. The direct React-i18next consumer reported no instance and rendered
the raw `nav.getStarted` key.

### Stored Brief heading language

```text
PATH=<node22> NODE_OPTIONS=--no-experimental-webstorage
pnpm --filter @turingcare/web exec vitest run src/routes/shared-brief.test.tsx
```

Exit 1: 1 failed, 2 passed. The Spanish shared title had no `lang` attribute.

### Trainer contact privacy

```text
PATH=<node22> NODE_OPTIONS=--no-experimental-webstorage
pnpm --filter @turingcare/web exec vitest run src/lib/session-query-boundary.test.tsx
```

Exit 1: 1 failed, 1 passed. The cached authenticated email and phone reappeared after logout
because `trainers` was not a cleared root.

### Malformed JSON

```text
PATH=<node22> DATABASE_URL=<local-test-db> BETTER_AUTH_SECRET=<test-only>
pnpm --filter @turingcare/api exec vitest run src/validation-contract.test.ts
```

Exit 1: 2 failed, 7 passed. Both locale cases returned `text/plain` instead of stable validation
JSON.

## Focused GREEN evidence

The same tests were rerun unchanged after implementation:

| Surface | Result |
| --- | --- |
| Profile identity | Exit 0; 1 file, 3 tests passed. |
| React-i18next runtime/facade | Exit 0; 1 file, 15 tests passed. |
| Shared Brief language metadata | Exit 0; 1 file, 3 tests passed. |
| Trainer contact privacy | Exit 0; 1 file, 2 tests passed. |
| Stable malformed-JSON contract | Exit 0; 1 file, 9 tests passed. |
| Affected package typechecks | Exit 0 for both web and API. |

## Locale runtime lifecycle

1. `LocaleProvider` detects one allowlisted initial locale in its state initializer.
2. The initializer synchronously commits that locale to the framework-neutral active-locale
   singleton, the single `WEB_I18N` instance, and `<html lang>` before provider children render.
3. `I18nextProvider` exposes that same initialized instance to React consumers.
4. `LocaleContextProvider` consumes React-i18next's `t` and wraps it with the shared typed
   `MessageKey` facade. There is no second React translation instance or private locale selector.
5. `selectLocale` and `adoptLocale` retain their explicit-intent distinction from round 2, validate
   unknown input before every sink, and synchronously run the same activation path. Storage write
   denial remains non-fatal because in-memory React state and the active request-locale singleton
   are independent of storage success.
6. Non-React callers that need a specified locale use a fixed translator on the same catalog
   runtime. That operation does not change `i18n.language`, the document, storage, or request
   headers.

## Identity and query lifecycle

The Profile route obtains identity only from Better Auth session state; it does not send or trust
a caller-supplied user id. `useProfile(sessionUserId)` uses `['profile', sessionUserId]` and passes
that same id into the untrusted-response decoder. A different response id fails before cacheable
profile data is returned.

The central session-bound roots are now:

```text
admin, brief, brief-sends, dog-journal, dogs, dogs-overview, focus, journal,
me, onboarding, overview, profile, progress, trainers
```

On initial resolved identity and every login, logout, or switch, the boundary gates authenticated
consumers, cancels and removes every descendant of those roots, clears mutation records, then
marks that identity ready. The `trainers` root is intentionally included because its detail
endpoint shape varies by authentication and can contain contact data. Public `training-catalog`
remains cached across transitions. Public route content is not gated by the cleanup boundary.

## Validation error contract

Malformed JSON now has the same stable shape in every request locale:

```json
{
  "success": false,
  "error": {
    "issues": [
      {
        "code": "custom",
        "path": [],
        "message": "validation.invalid"
      }
    ]
  }
}
```

The response is status 400 with JSON content type. It contains no parser exception text, input
body, translated prose, or locale-specific message. Ordinary Zod failures still preserve issue
ordering/path/code while normalizing unknown messages; explicit allowlisted codes are preserved.
Other 4xx HTTP exceptions retain their existing responses. Unexpected/5xx handling, capture,
safe structured logging, and request IDs are unchanged.

## Security and privacy trace

- Better Auth remains the only client-side session identity authority; no user id was added to a
  body, query parameter, cookie, or custom header.
- Profile JSON remains untrusted. Its object shape, scalar fields, nullable locale, and exact
  expected user id are checked before data can be returned to React Query or rendered.
- Malformed request bodies are reduced to a stable code. Raw parser prose and the request body are
  not returned, captured, or newly logged.
- Authenticated trainer email/phone no longer survives a resolved identity transition. The
  central readiness gate prevents private consumers from observing the old cache while removal
  runs.
- Locale input still passes the round-2 allowlist before React state, i18next language, storage,
  document metadata, or request-header state is changed.
- The new Brief `lang` attribute contains only the existing normalized `en`/`es` value. It does
  not interpolate user content or alter stored Brief/PDF/email generation.
- No telemetry, auth cookie, database, migration, HTML escaping, email, PDF, or secret-handling
  path changed.

## Implementation comparison

The previous `apps/web/src/i18n/index.tsx` kept one i18next instance per locale and selected one
inside the private facade. That allowed synchronous fixed translation but could not provide one
active, changing React-i18next runtime. The replacement keeps one instance/event source for React
while `getFixedT(locale)` preserves the old non-mutating fixed-locale utility property.

The installed `hono/dist/validator/validator.js` was also opened and compared. Its JSON branch
parses first and throws an `HTTPException` before the validation callback is invoked. Wrapping
only the Zod hook therefore cannot handle malformed syntax. The central error handler branch was
kept because it adds zero duplicate parsing, preserves Hono/Zod request typing and evaluation
order, and is covered through the real application.

## Full verification gates

All commands used Node `22.23.2`. API tests used the documented local PostgreSQL test database and
test-only Better Auth secret. Web commands used
`NODE_OPTIONS=--no-experimental-webstorage`.

| Gate | Final result |
| --- | --- |
| Shared i18n full tests | Exit 0; 1 file, 12 tests passed. |
| Shared schemas full tests | Exit 0; 8 files, 76 tests passed. |
| API full tests | Exit 0; 48 files, 341 tests passed. |
| Web full tests | Exit 0; 79 files, 351 tests passed. |
| `pnpm lint` | Exit 0; 347 files checked; no fixes applied. |
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

Coverage reports were written only under `/tmp`; no coverage artifact was added to the repository.

| Surface | Result |
| --- | --- |
| Web provider/Profile/shared-Brief/session-boundary | Exit 0; 4 files, 23 tests. 92.63% statements, 84.28% branches, 76.47% functions, 92.63% lines across the four changed source files. `shared-brief.tsx` reached 100% statements/lines/functions. |
| API validation/error boundaries | Exit 0; 2 files, 23 tests. 100% statements, functions, and lines; 93.75% branches across the two changed source files. `error-handler.ts` reached 100% in every metric. |

The remaining web misses are pre-existing fallback/unmounted-provider, update-submit, and context
absence paths; the changed identity mismatch, React runtime, stored heading, and logout privacy
branches are exercised. The remaining API branch is an existing successful-Zod callback path
covered elsewhere by the full suite; both new malformed-JSON locale paths are exercised.

## Cleanup and sweeps

- Dependency installation initially re-resolved unrelated Better Auth optional-Zod and shared
  Babel-runtime snapshots. That incidental churn was removed. The final lockfile adds only the
  requested React-i18next importer plus its actual transitive package/snapshot entries.
- Full diff check: exit 0; no whitespace errors.
- Added-line secret scan: no token, key, private-key, credentialed URL, connection string, or real
  credential match.
- Changed-surface debug scan: no `.only`, `.skip`, `debugger`, trace logging, TODO, or FIXME.
- Unscoped Profile route sweep: no direct `useProfile()` call remains.
- Generated artifact sweep: no repository coverage, LCOV, or `.DS_Store` artifact was added;
  build output remains ignored.
- File-scope sweep: only the requested API/web behavior, tests, dependency manifest/lockfile, and
  this report changed. README, deployment docs, project log, approved spec, and plan are untouched.

## Files changed

API contract:

- `apps/api/src/middleware/validation.ts`
- `apps/api/src/monitoring/error-handler.ts`
- `apps/api/src/validation-contract.test.ts`

Web runtime/privacy/artifact behavior:

- `apps/web/src/i18n/index.tsx`
- `apps/web/src/i18n/i18n.test.tsx`
- `apps/web/src/routes/profile.tsx`
- `apps/web/src/routes/profile.test.tsx`
- `apps/web/src/routes/shared-brief.tsx`
- `apps/web/src/routes/shared-brief.test.tsx`
- `apps/web/src/lib/session-query-boundary.tsx`
- `apps/web/src/lib/session-query-boundary.test.tsx`

Dependency metadata:

- `apps/web/package.json`
- `pnpm-lock.yaml`

SDD evidence:

- `.superpowers/sdd/2026-08-23-end-to-end-localization/final-review-round-3-fix-report.md`

## Concerns

No unresolved round-3 correctness, privacy, localization, validation, migration, or build concern
remains. The only observed notices are the documented pre-existing React test `act(...)` messages,
API test diagnostics, and Vite chunk-size advisory described above.
