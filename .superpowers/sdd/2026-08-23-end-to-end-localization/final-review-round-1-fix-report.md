# Final dual-review round 1 fix report

## Outcome

All ten verified round-1 findings against base `be23902` are resolved in one coherent fix wave.
The implementation keeps the approved precedence, stable-artifact, security, and privacy contracts
from the localization design and Task 6 audit. No README, deploy guide, project log, approved spec,
implementation plan, or prior SDD report was changed.

All behavior changes were driven by witnessed failing tests before their production fixes. The
final Node 22 lint, typecheck, full-test, production-build, Drizzle snapshot, targeted-coverage,
diff, secret, debug-residue, and focused-test sweeps pass. The only notices are the previously
documented React Suspense `act(...)` warnings and Vite's existing large-chunk advisory.

## Finding-by-finding resolution

| # | Finding | Resolution and permanent regression |
| ---: | --- | --- |
| 1 | Locale-free training query cache | `useTrainingCatalog()` now reads the active UI locale and keys queries as `['training-catalog', locale]`. A real hook test switches English to Spanish and proves a second localized request instead of reusing the one-hour English cache. |
| 2 | Template application bypasses `localeFetch` | `useApplyTemplate()` now sends the POST through `localeFetch`. The web regression proves the selected Spanish header and localized response fields; the existing real PostgreSQL route integration proves that the same header persists Spanish goal and skill display names. |
| 3 | Storage-denied explicit locale is not propagated | A framework-neutral `active-locale.ts` keeps only allowlisted `Locale` values. `LocaleProvider` updates it synchronously on initialization and explicit changes, and `localeFetch` prefers it over storage. The regression denies both storage reads and writes, switches to Spanish, and still observes `X-TuringCare-Locale: es`. Request headers plus `init.headers` are merged with `init`/caller precedence intact. |
| 4 | Account bridge is route-limited | Exactly one bridge is mounted above all route branches. Its outer component reads Better Auth session state and does not mount the `/me`/profile hooks while pending or signed out. Tests prove no unauthenticated profile request and account-locale adoption on the public landing route. |
| 5 | HTTP locale parser accepts malformed tags | The API now applies the same bounded whole-tag invariant as the browser: 64-byte candidate limit, full `Intl.getCanonicalLocales` validation, then primary-language allowlisting. HTTP q-value parsing, maximums, descending preference, and original ordering on ties remain unchanged. `es-x` and `es-1` are skipped in favor of later valid English and fall back to English when no valid candidate remains. |
| 6 | Fixed artifact copy lives in private catalogs | `generatedBrief`, `authEmail`, `briefEmail`, and `briefPdf` are first-class namespaces in both shared catalogs. API Brief composition, auth email, Brief email, and web PDF model resolve their fixed copy via `createI18n` plus `translate`; all private catalogs were removed. Recursive catalog parity now covers every artifact key. Existing output, stored-locale selection, and HTML escaping remain green. |
| 7 | English validation messages cross schema/UI/API boundaries | Explicit shared Zod prose is replaced by exported `validation.*` codes. The web translates only `isValidationMessageCode` allowlist members and maps unknown/default Zod messages to localized `validation.invalid`; it never renders an arbitrary message. All direct schema-message renderers use this boundary. Better Auth login/register/reset errors use localized fixed fallbacks instead of upstream prose. API validation retains stable codes even under a Spanish request; the two manual journal validation responses were also converted to stable codes. |
| 8 | Initial document language is post-commit | Locale resolution now activates the locale and sets `document.documentElement.lang` in the lazy state initializer, before descendants render. The existing effect remains for subsequent state updates. A child-render probe observes `es` on its first render. |
| 9 | Stored Brief lacks element-level language | Owned and shared Brief `<article>` containers now receive `lang={normalizeBriefLocale(storedLocale)}`. Opposite-UI tests cover Spanish stored artifacts under English UI and English stored artifacts under Spanish UI; invalid/legacy values retain the established English normalization. |
| 10 | Material regressions were missing | The suite now covers query refetch, apply header plus DB persistence, storage denial, Request/init merge, public-route bridge adoption, signed-out bridge idleness, malformed HTTP tags, first-commit document language, Spanish allowlisted validation, generic unknown fallback, stable API codes, raw auth-error suppression, and stored artifact language metadata. |

## Files and architecture

### Locale lifecycle and requests

- `apps/web/src/i18n/active-locale.ts`
- `apps/web/src/i18n/index.tsx`
- `apps/web/src/i18n/locale-account-bridge.tsx`
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/training-catalog.ts`
- `apps/web/src/main.tsx`
- `apps/api/src/middleware/locale.ts`

The lifecycle is:

1. `LocaleProvider` resolves storage/browser locale, validates it through shared locale helpers,
   updates the in-memory active locale, and sets `<html lang>` before rendering children.
2. An explicit UI switch synchronously updates active locale and `<html lang>`, then React state,
   then attempts the optional storage write. A denied write cannot roll back UI/request state.
3. The one global bridge remains inert until Better Auth reports a session. Once authenticated, it
   adopts an account locale or seeds a null account locale using the already-active UI locale.
4. `localeFetch` merges `Request.headers`, then `init.headers`, preserving explicit caller locale
   precedence. Only when the caller supplied none does it add the allowlisted active locale, with
   valid storage as a pre-provider fallback.
5. Training query identity includes the same selected locale, and template application uses the
   same request wrapper.

This preserves the established bridge protections for user changes, sign-in/user changes,
network failure, and out-of-order account saves.

### Shared system-copy resources

`packages/i18n/src/en.ts` and `packages/i18n/src/es.ts` now own:

- `generatedBrief.*`: headings, dog grammar and gendered size labels, severity/confidence labels,
  journal/check-in copy, ABC prefixes, progress/milestone/session copy;
- `authEmail.*`: verification/reset subjects, headings, intro, CTA, text body, fallback link, footer;
- `briefEmail.*`: title, sender label, footer;
- `briefPdf.*`: title, filename prefix, missing-dog fallback, labels, enums, and age units;
- `validation.*`: allowlisted field messages plus the localized generic fallback.

The recursive `keyPaths()` parity assertion compares the complete English and Spanish trees, so a
missing nested artifact or validation key fails the shared i18n test. A runtime regression resolves
representative keys from all four generated-artifact namespaces in Spanish.

User-authored dog names, breeds, concerns, goals, journal text, trainer notes, owner names,
recipient messages, and Brief summaries remain data. They are interpolated only into plain-text,
React/PDF text, or the existing HTML-escaped email slots; they are never machine-translated or
treated as executable templates.

For the final implementation comparison, the new artifact consumers were checked against the
existing direct-tree selectors in `brief-chrome.ts` and `data/training-catalog.ts`. Direct indexing
is compact for static leaf access, but it would duplicate interpolation and bypass the explicitly
required shared runtime on generated artifacts. The chosen typed `MessageKey` translators keep
interpolation and fallback behavior centralized. Conversely, the article `lang` work reuses the
existing `normalizeBriefLocale` selector because that path needs normalization, not translation;
duplicating a second artifact-locale parser would weaken the established legacy-English invariant.

### Validation error contract

`packages/shared/src/validation.ts` is the single code allowlist. Shared schemas emit stable values
such as `validation.nameRequired`, `validation.emailInvalid`, and
`validation.httpUrlRequired`. Manual API journal date/trend issues use the same contract.

At web presentation boundaries, `useValidationMessage()` behaves as follows:

| Input | Browser output |
| --- | --- |
| Known allowlisted `validation.*` code | Translation for the active UI locale |
| Unknown string, default Zod prose, missing/non-string value | Localized `validation.invalid` |
| Better Auth upstream error object | Surface-specific localized fixed fallback; upstream detail is not shown |

The API does not translate issue messages. A Spanish profile request with an empty name still
returns `validation.nameRequired`, making the response machine-stable and locale-independent.
The web allowlist itself has direct true/false/non-string coverage.

Direct `.message` presentation sites were migrated in profile, dog form, Brief send panel,
practice-session form, structured journal details, change-password form, and the shared form
message primitive. Login, registration, and password-reset raw auth errors were swept separately.

## RED evidence

All commands used Node 22. API environment values are intentionally redacted.

### Wave A: locale request, bridge, parser, and first-render behavior

Focused web regressions were run before production changes:

```text
PATH=<node22> NODE_OPTIONS=--no-experimental-webstorage \
pnpm --filter @turingcare/web exec vitest run \
  src/lib/training-catalog.test.tsx src/lib/api.test.ts \
  src/i18n/locale-account-bridge.test.tsx
```

Observed failures:

```text
opposite-locale catalog: Spanish "Modales básicos" was absent after the switch
template apply: expected X-TuringCare-Locale "es"; received null
storage denied: expected X-TuringCare-Locale "es"; received null
signed out bridge: expected no fetch; /me was requested
```

The real-root public-route regression failed against the old route-limited mounting:

```text
PATH=<node22> NODE_OPTIONS=--no-experimental-webstorage \
pnpm --filter @turingcare/web exec vitest run src/main.test.tsx

Expected the Spanish landing heading after account adoption; Spanish heading was absent.
Test Files 1 failed (1); Tests 1 failed (1)
```

Whole-tag API validation failed before replacing the permissive regular expression:

```text
DATABASE_URL=<local-test-db> BETTER_AUTH_SECRET=<test-only> PATH=<node22> \
pnpm --filter @turingcare/api exec vitest run src/middleware/locale.test.ts

es-x fallback: Expected { locale: "en" }; Received { locale: "es" }
es-1 fallback: Expected { locale: "en" }; Received { locale: "es" }
Tests 2 failed
```

The initial document-language regression observed the old post-commit timing:

```text
PATH=<node22> NODE_OPTIONS=--no-experimental-webstorage \
pnpm --filter @turingcare/web exec vitest run src/i18n/i18n.test.tsx

First child render: Expected "es"; Received ""
Tests 1 failed
```

### Wave B: shared resources, validation, and artifact metadata

The shared-resource runtime assertion initially returned its raw missing keys:

```text
PATH=<node22> pnpm --filter @turingcare/i18n exec vitest run src/index.test.ts

Expected Spanish values for generatedBrief/authEmail/briefEmail/briefPdf;
received the four raw message keys.
Tests 1 failed
```

The shared schema contract table was then run before replacing embedded prose:

```text
PATH=<node22> pnpm --filter @turingcare/shared exec vitest run src/validation.test.ts

Test Files 1 failed (1); Tests 25 failed (25)
Examples: Expected validation.nameRequired; Received "Name is required"
          Expected validation.emailInvalid; Received "Invalid email"
```

The API and browser boundary regressions also failed before their fixes:

```text
API profile: Expected validation.nameRequired; Received "Name is required"
Spanish Brief-send email: Expected "Ingresa un correo electrónico válido"; English shown
Spanish profile default max error: Expected "Revisa este campo."; raw Zod prose shown
reset-password auth sentinel: Expected localized fixed failure; upstream sentinel shown
owned/shared Brief article: Expected lang="es"/lang="en"; attribute absent
Web result: 5 failed files; 6 failed tests; 20 passed tests
```

Finally, an API sweep found two hand-built journal issue messages outside shared Zod schemas. Their
stable-code assertions were captured before changing the route:

```text
DATABASE_URL=<local-test-db> BETTER_AUTH_SECRET=<test-only> PATH=<node22> \
pnpm --filter @turingcare/api exec vitest run src/routes/dogs.test.ts \
  -t 'rejects invalid occurredAt|without a trend'

Test Files 1 failed (1); Tests 3 failed | 60 skipped (63)
```

## Focused GREEN evidence

```text
Wave A web:
  Test Files 5 passed (5); Tests 30 passed (30)

Wave A API locale plus real template persistence:
  Test Files 2 passed (2); Tests 15 passed | 59 skipped (74)

Wave B shared validation:
  Test Files 1 passed (1); Tests 25 passed (25)

Wave B shared i18n:
  Test Files 1 passed (1); Tests 12 passed (12)

Wave B web Brief/PDF/validation/auth surfaces:
  Test Files 7 passed (7); Tests 42 passed (42)

Wave B API Brief/auth-email/Brief-email/profile:
  Test Files 4 passed (4); Tests 31 passed (31)

Manual API journal stable codes:
  Test Files 1 passed (1); Tests 3 passed | 60 skipped (63)

Supplemental allowlist/auth-message coverage:
  Shared validation: 1 file, 26 tests passed
  Web active locale + login/register: 3 files, 7 tests passed
```

## Security and privacy trace

### Request and locale trust boundaries

- Browser storage is untrusted and optional. Only `en`/`es` values survive `isLocale`; exceptions
  are caught. The in-memory state accepts the same allowlist and cannot be replaced by `fr` or an
  arbitrary stored value.
- A caller-supplied locale header remains authoritative. `Request` headers survive, explicit
  `init.headers` overrides the corresponding `Request` value, and the wrapper injects only when no
  locale header already exists.
- Dedicated API locale headers remain capped at 16 bytes and exact-allowlisted. `Accept-Language`
  remains capped at 256 bytes/eight candidates; each tag is capped at 64 bytes and must
  canonicalize completely before its primary language is used. q-values retain the strict
  `0..1`, three-decimal, one-parameter rules.
- Raw locale strings never reach SQL or output. The validated `Locale` alone selects fixed
  resources and reaches the existing PostgreSQL enum-backed stored Brief field.

### Authentication and authorization

- The global account bridge performs no `/me`, profile GET, or profile PATCH when `useSession()` is
  pending or unauthenticated, preventing public-route request loops.
- Once signed in, identity still comes from Better Auth session state and `/me`; no client-supplied
  user id is accepted by the API. Existing cross-user and missing-row coverage remains green.
- Moving the bridge does not make public routes private and does not alter route guards.

### Content and rendering sinks

- Auth-email URLs are escaped before HTML attribute/body interpolation; plain-text fallback keeps
  the original URL. Brief email continues escaping dog, owner, optional message, and summary.
- Generated Brief and PDF resources are fixed catalog strings. User-authored content remains plain
  text, React text, or React-PDF `<Text>` and is not evaluated as markup.
- Validation rendering accepts only the shared code allowlist. Unknown server/library messages and
  default Zod prose collapse to a fixed localized generic message, preventing accidental display
  of arbitrary upstream details.
- Stored article language attributes derive only from normalized locales.

### Telemetry and privacy

No locale, locale header, validation detail, email content, Brief content, or translated copy was
added to telemetry, Sentry tags, monitoring metadata, or logs. Existing fixed telemetry properties
remain unchanged. No new executable-template or raw-HTML sink was introduced.

## Targeted changed-surface coverage

Coverage reports were written only below `/tmp`; no repository coverage artifacts were produced.

| Surface | Files/tests | Statements | Branches | Functions | Lines | Inspection |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Shared i18n runtime | 1 / 12 | 100% | 83.33% | 100% | 100% | Misses are the already-inspected input-normalization/defensive translator branches. Recursive catalog parity and all new namespace runtime access are covered. |
| Shared changed schemas | 1 / 25 | 98.97% | 100% | schema declarations | 98.97% | Every changed schema file reported 100%; the initially missed allowlist function received a supplemental 100% run. |
| Shared validation allowlist supplemental | 1 / 26 | 100% | 100% | 100% | 100% | Known, unknown, and non-string inputs covered. |
| API changed localization surfaces | 7 / 112 | 91.71% | 81.98% | 100% | 91.71% | Email templates are 100%; locale middleware is 100% statements/84% branches; Brief is 99.48%; profile is 100%; broad dogs route misses are unrelated CRUD/error branches. |
| Web changed localization surfaces | 12 / 72 | 82.74% | 84.25% | 80% | 82.74% | Bridge and validation boundary are 100%; PDF 98.23%; request wrapper 93.33%; low aggregate includes route branches outside the targeted assertions. |
| Web active state + auth fallbacks supplemental | 3 / 7 | 100% | 100% | 100% | 100% | Active allowlist plus complete login/register success and sanitized-failure branches covered. |

Material uncovered behavior was not left percentage-only. The remaining inspected misses are
defensive unavailable-global/storage branches, unsupported enum/date fallbacks, an uncommon
multi-session-without-week-span formatting branch, lazy admin imports, and unrelated dogs route
branches. The required storage-denied cross-layer path is covered through the active state, even
though it intentionally short-circuits the storage read in `localeFetch`.

## Full required gates

Verified runtime: Node `22.23.2`, pnpm `11.1.2`, Vitest `2.1.9`.

| Gate | Result |
| --- | --- |
| `pnpm lint` | Exit 0; `Checked 341 files ... No fixes applied.` |
| `pnpm typecheck` | Exit 0; shared i18n, shared schemas, API, and web all completed. |
| Shared full tests | Exit 0; 8 files, 75 tests passed. |
| Shared i18n full tests | Exit 0; 1 file, 12 tests passed. |
| API full tests | Exit 0; 47 files, 332 tests passed against local PostgreSQL. |
| Web full tests | Exit 0; 76 files, 332 tests passed with experimental web storage disabled. |
| `pnpm build` | Exit 0; API TypeScript build and web Vite production build completed. |
| `drizzle-kit check` | Exit 0; `Everything's fine` for the existing API migration snapshots. |
| `git diff --check` | Exit 0; no whitespace errors. |

## Final sweeps

- Private `briefCatalog`, `templateCatalog`, `briefEmailCatalog`, and `pdfCatalog` symbols: zero.
- Raw `fetch()` in `training-catalog.ts`: zero; template apply routes through `localeFetch`.
- Production `<LocaleAccountBridge />` mounts: exactly one.
- Direct web `.message` rendering: zero; the sole generic form message passes through
  `useValidationMessage()`.
- Explicit English validation prose in shared schema message arguments: zero.
- Added focused/disabled tests (`.only`, `.skip`, `fit`, `fdescribe`): zero.
- Added `debugger`, `console.log/debug/trace`, or `TODO/FIXME/HACK/XXX`: zero.
- Added private keys, provider tokens, API-key assignments, or production credentials: zero.
- Added binary, archive, build, or coverage artifacts: zero.
- Files outside the expected API/web/shared-i18n/shared-schema/test/report surfaces: zero.
- README, deploy documentation, project log, approved spec, implementation plan, and prior SDD
  reports: unchanged, as required until both final reviewers are clean.

## Concerns

No unresolved correctness, security, privacy, migration, or test blocker remains in this fix wave.
The full web suite still emits the pre-existing React Suspense `act(...)` notice in Brief/share
tests, and the production build still emits Vite's pre-existing chunk-size advisory. Neither is
introduced by these changes or affects gate status. Documentation intended for end users remains
deliberately deferred until both independent final reviewers report clean.
