# Task 6 report: boundary, security, privacy, and coverage verification

## Outcome

Task 6 found and corrected three witnessed gaps:

1. Browser locale detection accepted arbitrary strings beginning with `es` (for example,
   `esoteric`) as Spanish.
2. The PDF model input type advertised a current-UI `locale` fallback that the stable-artifact
   contract deliberately ignored.
3. A Spanish PDF with unavailable dog data rendered the English fallback `Unknown`.

The branch-owned repository lint findings were also corrected. All required Node 22 lint,
typecheck, test, build, and migration gates pass. The implementation remains detached at the
externally managed worktree HEAD; the resulting Task 6 commit hash is recorded in the handoff.

## Environment and baseline

- Base audited: `841d592`.
- Task 6 starting HEAD: `2ba3da8`.
- The Codex worktree is a linked, isolated worktree with detached HEAD.
- The default shell exposed Node `26.5.0`, so every verification command was explicitly run with
  `/opt/homebrew/opt/node@22/bin` first on `PATH`.
- Verified gate runtime: Node `22.23.2`, pnpm `11.1.2`, Vitest `2.1.9`, and
  `@vitest/coverage-v8` `2.1.9`.
- Local PostgreSQL verification:
  - listener present on `127.0.0.1:5432`;
  - `localhost` resolved to loopback;
  - TCP connection succeeded;
  - a real `select 1` round trip returned `query_ok=true`;
  - required API environment values were checked only for presence/shape and were not printed.

Initial `pnpm lint` reproduced 10 branch-owned errors in:

- `apps/api/src/app.ts`;
- `apps/api/src/monitoring/error-handler.ts`;
- `packages/i18n/src/index.test.ts`;
- `apps/web/src/components/turing-companion.test.tsx`;
- `apps/web/src/i18n/index.tsx`;
- `apps/web/src/i18n/i18n.test.tsx`;
- `apps/web/src/lib/api.test.ts`.

They were import-order/formatting findings plus two `noDelete` findings. The deletes were replaced
with `Reflect.deleteProperty`, preserving test cleanup semantics; all other lint changes are
mechanical Biome formatting/import ordering.

## Targeted coverage

`@vitest/coverage-v8@2.1.9` was absent and was added as an exact root dev dependency so the same
provider serves all three Vitest workspaces. Reports were written only beneath temporary `/tmp`
directories and did not leave repository artifacts.

Commands, with the API environment redacted here:

```text
PATH=<node22> pnpm --filter @turingcare/i18n exec vitest run src/index.test.ts \
  --coverage.enabled --coverage.provider=v8 --coverage.reporter=text \
  --coverage.include=src/index.ts

DATABASE_URL=<local-test-db> BETTER_AUTH_SECRET=<test-only> PATH=<node22> \
pnpm --filter @turingcare/api exec vitest run \
  src/middleware/locale.test.ts src/routes/profile.test.ts src/lib/brief.test.ts \
  src/email/brief-email.test.ts src/email/templates.test.ts src/auth-email.test.ts \
  src/data/training-catalog.test.ts src/routes/training.test.ts src/routes/dogs.test.ts \
  --coverage.enabled --coverage.provider=v8 --coverage.reporter=text \
  --coverage.include=<locale/profile/Brief/email/auth/training source files>

NODE_OPTIONS=--no-experimental-webstorage PATH=<node22> \
pnpm --filter @turingcare/web exec vitest run \
  src/i18n/i18n.test.tsx src/i18n/locale-account-bridge.test.tsx src/lib/api.test.ts \
  src/routes/brief.test.tsx src/routes/shared-brief.test.tsx \
  src/lib/brief-pdf-model.test.ts src/components/brief-pdf-document.test.tsx \
  src/components/admin-shell/AdminShell.test.tsx src/routes/admin \
  --coverage.enabled --coverage.provider=v8 --coverage.reporter=text \
  --coverage.include=<provider/bridge/request/Brief/PDF/admin source files>
```

Final targeted results:

| Surface | Test files | Tests | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Shared i18n | 1 | 8 | 100% | 72.72% | 100% | 100% |
| API localization targets | 9 | 122 | 92.57% | 81.64% | 100% | 92.57% |
| Web localization targets | 16 | 83 | 92.97% | 77.77% | 76.13% | 92.97% |

High-signal file results:

| File/surface | Statements | Branches | Functions | Ruling |
| --- | ---: | ---: | ---: | --- |
| API training catalog | 100% | 100% | 100% | Request-isolated fresh catalog structures covered. |
| API Brief/auth email templates | 100% | 100% | 100% | Locale selection and HTML escaping covered. |
| API locale middleware | 100% | 77.27% | 100% | Uncovered branches are additional rejected malformed forms/default operands. |
| API profile route | 100% | 75% | 100% | Miss is the inconsistent session-without-user-row 404 guard. |
| Web locale account bridge | 100% | 100% | 100% | Missing profile, adoption, failure, switch, and ordering logic inspected/covered. |
| Web i18n provider | 98.21% | 82.6% | 87.5% | Misses are unavailable-global/default-provider defensive paths. |
| Web request wrapper | 93.33% | 75% | 100% | Miss is storage-read denial, which returns distinguishable `null` and sends no locale header. |
| Web PDF model | 98.13% | 75.75% | 87.5% | Misses include the `Intl` exception fallback and uncommon enum/date branches. |

Inspected misses were not converted into percentage-only tests. Material behavior misses became
RED tests; defensive branches with already-correct behavior were documented:

- shared i18n ternary input normalization and defensive non-string `i18next.t()` result;
- API production cookie-domain configuration;
- API rejected malformed tags/empty or duplicate q-parameters and final English fallback;
- unrelated dog CRUD/journal/send-rate branches included because the Brief route shares the file;
- web storage-denial catches, provider-without-context fallback, UI click/edit/error branches, and
  `Intl.DateTimeFormat` exception fallback.

## RED/GREEN corrections

### 1. Strict browser language tags

Production change that makes the test fail if regressed: replacing exact supported-tag validation
with raw prefix matching.

RED:

```text
resolveBrowserLocale(["esoteric"])
Expected: "en"
Received: "es"
Test Files 1 failed (1); Tests 1 failed | 7 passed (8)
```

Fix: `resolveBrowserLocale` now accepts only complete `en`/`es` language tags with bounded
hyphen-separated subtags. It still preserves browser ordering and case-insensitive regional
variants. Compared with the API's `LANGUAGE_TAG_PATTERN` plus `isLocale` implementation: both
validate the whole tag before reducing to the two-value allowlist; the browser helper embeds the
supported primary allowlist directly because navigator values do not require HTTP whitespace/q
parsing.

GREEN:

```text
Test Files 1 passed (1)
Tests 8 passed (8)
```

### 2. PDF current-UI fallback contract

This was a type-contract gap, not a runtime locale gap. Stable Brief artifacts must use
`brief.locale`; migrated/legacy Briefs without it must use English. The `locale?: string` input and
the caller-provided current UI locale implied a fallback that was intentionally ignored.

Compile-time RED guard:

```text
src/lib/brief-pdf-model.test.ts: Unused '@ts-expect-error' directive.
@turingcare/web typecheck: exit 2
```

Fix: remove the unused current-UI locale input and caller prop; retain `brief.locale ?? "en"`.
The permanent compile guard fails typecheck if that misleading input is reintroduced. The legacy
behavioral test asserts English title/date when `brief.locale` is absent.

GREEN:

```text
PDF model/document: Test Files 2 passed (2); Tests 12 passed (12)
Web typecheck: exit 0
```

### 3. Spanish missing-dog PDF fallback

Production change that makes the test fail if regressed: using a single English fallback instead
of the stored Brief locale's catalog.

RED:

```text
Expected: "Desconocido"
Received: "Unknown"
Test Files 1 failed (1); Tests 1 failed | 9 passed (10)
```

Fix: add `unknownDogName` to both PDF locale catalogs and resolve the fallback after selecting the
stored Brief locale.

GREEN:

```text
Test Files 1 passed (1)
Tests 10 passed (10)
```

## Boundary, authorization, and sink trace

### Request headers

`X-TuringCare-Locale` / `Accept-Language` -> `resolveRequestLocale`:

- dedicated header capped at 16 bytes, trimmed/case-normalized, then checked by `isLocale`;
- `Accept-Language` capped at 256 bytes and eight candidates;
- complete tag grammar validated before the primary language is allowlisted;
- only one optional q-parameter is accepted; q grammar is restricted to `0..1` with at most three
  decimal places; malformed, duplicate, or zero-weight candidates are rejected;
- the resulting `Locale` is placed in Hono context and `Content-Language`, never the raw header.

Validated context locale reaches only fixed catalog selection, localized training responses,
new Brief summary/persistence, and Better Auth verification/reset templates. Drizzle receives a
typed enum value; SQL is generated with bound values, not interpolation.

### Browser storage and provider

`tc-locale` -> `detectInitialLocale` / `localeFetch`:

- storage values pass `isLocale`; malformed values fall through and cannot become headers;
- unavailable reads fall through to browser detection or produce no request locale header;
- unavailable writes keep the in-memory locale and translated UI working;
- navigator languages now require a complete supported tag;
- `localeFetch` merges `Request` headers and caller `init.headers`, preserves caller precedence,
  and adds only an allowlisted stored locale.

### Authenticated account locale

`PATCH /api/profile/locale` JSON -> strict `profileLocaleUpdateSchema` -> `requireUser`:

- body accepts exactly `{ locale: "en" | "es" }` and rejects unknown fields such as client
  `userId` claims;
- `requireUser` derives identity from `auth.api.getSession()` on every request;
- the update predicate uses only that session-derived user id;
- the PostgreSQL enum independently constrains stored values;
- tests prove unauthenticated rejection and cross-user isolation.

The web bridge is idle without a current user/profile, adopts a stored account locale on sign-in or
user switch, seeds an account with a valid local/browser locale when null, keeps explicit UI
choices on network failure with localized feedback, and reasserts the latest desired value after
out-of-order saves. A late failure from an obsolete desired locale does not display a stale toast.

### Stable Brief, HTML, React, and PDF sinks

- New Brief: validated request locale -> `composeBrief` -> Drizzle `briefs.locale` enum. Database
  default and migration are English.
- Owned/shared Brief chrome: stored `brief.locale` -> fixed catalog selectors. Invalid/missing
  legacy values normalize to English.
- Brief email: latest stored Brief locale, not send-request locale, selects fixed chrome.
  Dog/owner/message/summary are escaped for HTML; text fallback preserves them as text.
- Auth email: initiating raw request is re-run through the same request-locale resolver. URL is
  escaped before HTML attribute/body interpolation.
- Web rendering uses React text children. PDF rendering uses React-PDF `<Text>` values and a
  sanitized filename slug; neither uses raw HTML sinks.
- User-authored dog names, summaries, notes, goals, messages, trainers, and courses remain data and
  are never machine-translated.

### Privacy and telemetry

No locale was added to telemetry or monitoring:

- branch `recordEvent` calls continue to send existing fixed props (`window`, `source`, and event
  identifiers); none includes locale, locale headers, profile locale, or translated text;
- browser page/view tracking continues to send existing path/id props only;
- server identity for client events comes from the verified session, not the body;
- monitoring logs allow only request id, normalized route, method, status, and safe error type;
- Sentry tags allow only `application`, `route`, `method`, `status`, and `request_id`; request
  headers/bodies and breadcrumbs are dropped.

## Failure and compatibility matrix

| Case | Verified outcome |
| --- | --- |
| Null/empty storage | Browser resolution, then English final fallback. |
| Malformed storage | Rejected by `isLocale`; no arbitrary request header. |
| Storage write denial | UI state/translation changes in memory; persistence failure is not reported as success. |
| Storage read denial | Provider falls through; request wrapper omits locale header. |
| Malformed/oversized locale header | Rejected; supported `Accept-Language` may win, otherwise English. |
| Malformed/zero/weighted q-values | Invalid/zero candidate ignored; highest supported positive weight wins; ties preserve order. |
| Missing user/profile | Profile API has 401/404 guards; bridge performs no adoption/save without loaded profile. |
| Profile save network failure | Local choice remains; localized error toast shown only for latest desired locale. |
| Out-of-order saves | Latest desired locale is re-persisted until server response agrees. |
| Missing translation | Catalog parity test prevents missing supported keys; runtime missing key returns its key string. |
| Legacy/default Brief | Database migration/default is `en`; web model normalizes absent stored locale to English. |
| Request vs stored Brief locale | Generation stores request locale; later email/web/PDF use stored locale. |
| HTML/PDF hostile interpolation | Email HTML escapes data; React/React-PDF treat values as data; filename is slugged. |
| Training request isolation | `getTrainingCatalog(locale)` builds fresh nested structures per call; mutations do not leak. |

## Deferred-minor rulings

1. Shared browser resolver prefix matching was material because it accepted malformed language
   identifiers at a trust boundary. Fixed with witnessed RED/GREEN coverage.
2. PDF current-UI fallback was behaviorally correct but contractually misleading. Fixed by removing
   the unused input/caller prop and adding a compile-time guard. Legacy/default behavior remains
   explicitly English, matching the migration and stable-artifact design.

Recommendation: keep browser and HTTP parsers separate because HTTP has bounding/q/whitespace
requirements, but preserve the shared invariant that the entire tag is validated before primary
language allowlisting. Keep current UI locale out of stable-artifact model inputs.

## Sweeps

- `git diff --check` for Task 6 changes: zero findings.
- Entire branch `git diff --check 841d592`: one extra blank line at EOF in the approved design spec.
  It predates Task 6 and was left untouched because Task 6 explicitly forbids spec/plan edits.
- Focused/disabled tests (`.only`, `.skip`, `fit`, `fdescribe`): zero added-line hits.
- Debug residue (`debugger`, `console.log/debug/trace`) and `TODO/FIXME/HACK/XXX`: zero added-line
  hits outside reports/spec/plan.
- Sensitive filenames/private keys/provider tokens/generic API-token assignments: zero hits.
- Credential-shaped local DB/auth assignments: hits occur only in prior Task 4/5 verification
  reports and are the documented local/test-only gate fixtures; no production credential or source
  assignment was found. Values are intentionally omitted here.
- Hardcoded visible-copy sweep: only localized PDF catalog strings and `TuringCare` brand literals
  remain in scope. The one uncataloged English fallback found (`Unknown`) was corrected.
- Added binary/archive/build/coverage artifacts: zero.
- Added paths outside expected report/API/web/i18n/migration/spec-plan roots: zero.
- Task 6 did not modify the approved spec, implementation plan, or Task 6 brief.

## Full required gates

All commands used Node `22.23.2`; API environment values are redacted.

| Gate | Result/evidence |
| --- | --- |
| `pnpm lint` | exit 0; `Checked 334 files ... No fixes applied.` |
| `pnpm typecheck` | exit 0; i18n, shared, API, and web all `Done`. |
| Shared full tests | exit 0; `7 passed` files, `49 passed` tests. |
| i18n full tests | exit 0; `1 passed` file, `8 passed` tests. |
| API full tests | exit 0; `47 passed` files, `328 passed` tests. |
| Web full tests | exit 0; `73 passed` files, `321 passed` tests. |
| `pnpm build` | exit 0; API TypeScript build and web Vite production build completed. |
| `drizzle-kit check` | exit 0; `Everything's fine` for `apps/api/drizzle`. |

## Files changed by Task 6

Behavior/tests/contracts:

- `packages/i18n/src/index.ts`
- `packages/i18n/src/index.test.ts`
- `apps/web/src/lib/brief-pdf-model.ts`
- `apps/web/src/lib/brief-pdf-model.test.ts`
- `apps/web/src/components/brief-download-button.tsx`

Coverage dependency:

- `package.json`
- `pnpm-lock.yaml`

Branch-owned lint corrections:

- `apps/api/src/app.ts`
- `apps/api/src/monitoring/error-handler.ts`
- `apps/web/src/components/turing-companion.test.tsx`
- `apps/web/src/i18n/index.tsx`
- `apps/web/src/i18n/i18n.test.tsx`
- `apps/web/src/lib/api.test.ts`

Evidence:

- `.superpowers/sdd/2026-08-23-end-to-end-localization/task-6-report.md`

Commit message: `fix: close localization boundary gaps` (this report is included; final hash is in
the handoff).

## Concerns

- Web full tests and targeted Brief coverage emit existing React Suspense `act(...)` warnings in
  Brief/share-sheet tests. They do not fail the suite, but the test harness should eventually await
  the lazy resource inside `act`.
- Vite reports chunks above 500 kB, including the already lazy-loaded PDF bundle. Build succeeds;
  bundle-size optimization is outside this localization boundary task.
- The user-pinned Vitest `2.1.9` coverage provider resolves deprecated `glob@10.5.0` transitively
  and pnpm reports that warning during installation. This is test tooling only and does not enter
  the application bundles. A coordinated Vitest upgrade is explicitly out of scope for Task 6;
  the required coverage-provider version was not changed.
- No blocking Task 6 concern remains.
