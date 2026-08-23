# Task 4 Report: Locale-stable Briefs, PDFs, and emails

## Status

Implemented and committed-ready.

## Files changed

- `apps/api/src/lib/brief.ts`
- `apps/api/src/lib/brief.test.ts`
- `apps/api/src/routes/dogs.ts`
- `apps/api/src/routes/dogs.test.ts`
- `apps/api/src/email/templates.ts`
- `apps/api/src/email/templates.test.ts`
- `apps/api/src/email/brief-email.ts`
- `apps/api/src/email/brief-email.test.ts`
- `apps/api/src/auth.ts`
- `apps/api/src/auth-email.test.ts`
- `apps/api/src/middleware/locale.ts`
- `apps/web/src/lib/brief-pdf-model.ts`
- `apps/web/src/lib/brief-pdf-model.test.ts`
- `apps/web/src/components/brief-pdf-document.tsx`
- `apps/web/src/components/brief-pdf-document.test.tsx`

Extra file note: `apps/api/src/middleware/locale.ts` was required to export one strict request-locale resolver for Better Auth raw `Request` callbacks instead of duplicating header parsing. No migration, spec, or plan files were modified.

## RED output

Brief composer RED:

```text
$ DATABASE_URL='postgres://postgres:postgres@localhost:5432/turingcare' BETTER_AUTH_SECRET='test-only-insecure-secret-0123456789abcdef' pnpm --filter @turingcare/api exec vitest run src/lib/brief.test.ts

 RUN  v2.1.9 /Users/elopenmike/.codex/worktrees/f7ae/TuringCare/apps/api

 ❯ src/lib/brief.test.ts (7 tests | 2 failed) 14ms
   × composeBrief > renders Spanish fixed prose, enum labels, plural branches, and dates 3ms
     → expected 'Biscuit is a medium female Aussie.\n\…' to contain 'Biscuit es una perra mediana Aussie.'
   × composeBrief > uses Spanish singular and all-time branches 0ms
     → expected 'Pancake is a large male.\n\nConcerns:…' to contain 'Pancake es un perro grande.'

 Test Files  1 failed (1)
      Tests  2 failed | 5 passed (7)
```

Route RED:

```text
$ DATABASE_URL='postgres://postgres:postgres@localhost:5432/turingcare' BETTER_AUTH_SECRET='test-only-insecure-secret-0123456789abcdef' pnpm --filter @turingcare/api exec vitest run src/routes/dogs.test.ts -t "stores the validated request locale|keeps the English default|uses the stored brief locale"

 RUN  v2.1.9 /Users/elopenmike/.codex/worktrees/f7ae/TuringCare/apps/api

 ❯ src/routes/dogs.test.ts (62 tests | 2 failed | 59 skipped) 347ms
   × dogs: brief > stores the validated request locale when generating a Spanish brief 161ms
     → expected 'en' to be 'es' // Object.is equality
   × dogs: brief send > POST send: uses the stored brief locale instead of the current request locale 93ms
     → expected 'Behavior Brief: Biscuit' to be 'Resumen de conducta: Biscuit' // Object.is equality

 Test Files  1 failed (1)
      Tests  2 failed | 1 passed | 59 skipped (62)
```

Email/auth RED:

```text
$ DATABASE_URL='postgres://postgres:postgres@localhost:5432/turingcare' BETTER_AUTH_SECRET='test-only-insecure-secret-0123456789abcdef' pnpm --filter @turingcare/api exec vitest run src/email/templates.test.ts src/email/brief-email.test.ts src/auth-email.test.ts

 RUN  v2.1.9 /Users/elopenmike/.codex/worktrees/f7ae/TuringCare/apps/api

 ✓ src/email/templates.test.ts (6 tests) 3ms
 ✓ src/email/brief-email.test.ts (8 tests) 3ms
 ❯ src/auth-email.test.ts (7 tests | 3 failed) 561ms
   × auth email wiring > localizes verification email from the validated Better Auth request locale 65ms
     → expected 'Verify your TuringCare email' to be 'Verifica tu correo de TuringCare' // Object.is equality
   × auth email wiring > does not trust an invalid raw locale header in Better Auth callbacks 62ms
     → expected 'Verify your TuringCare email' to be 'Verifica tu correo de TuringCare' // Object.is equality
   × auth email wiring > localizes password-reset email from the validated Better Auth request locale 66ms
     → expected 'Reset your TuringCare password' to be 'Restablece tu contraseña de TuringCare' // Object.is equality

 Test Files  1 failed | 2 passed (3)
      Tests  3 failed | 18 passed (21)
```

PDF RED:

```text
$ NODE_OPTIONS='--no-experimental-webstorage' pnpm --filter @turingcare/web exec vitest run src/lib/brief-pdf-model.test.ts src/components/brief-pdf-document.test.tsx

 RUN  v2.1.9 /Users/elopenmike/.codex/worktrees/f7ae/TuringCare/apps/web

 ❯ src/lib/brief-pdf-model.test.ts (9 tests | 2 failed) 14ms
   × buildBriefPdfModel > uses the stored Spanish brief locale for labels, filename, date, and enum values 3ms
     → expected 'Behavior Brief' to be 'Resumen de conducta' // Object.is equality
   × buildBriefPdfModel > prefers brief.locale over the current UI locale 0ms
     → expected 'Behavior Brief' to be 'Resumen de conducta' // Object.is equality
 ❯ src/components/brief-pdf-document.test.tsx (3 tests | 1 failed) 5ms
   × BriefPdfDocument > renders already-localized Spanish model labels 3ms
     → expected 'Turing Care Behavior Brief Biscuit   …' to contain 'Raza'

 Test Files  2 failed (2)
      Tests  3 failed | 9 passed (12)
```

## GREEN output

Brief composer GREEN:

```text
$ DATABASE_URL='postgres://postgres:postgres@localhost:5432/turingcare' BETTER_AUTH_SECRET='test-only-insecure-secret-0123456789abcdef' pnpm --filter @turingcare/api exec vitest run src/lib/brief.test.ts

 RUN  v2.1.9 /Users/elopenmike/.codex/worktrees/f7ae/TuringCare/apps/api

 ✓ src/lib/brief.test.ts (7 tests) 3ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Focused API GREEN after route/email/auth wiring:

```text
$ DATABASE_URL='postgres://postgres:postgres@localhost:5432/turingcare' BETTER_AUTH_SECRET='test-only-insecure-secret-0123456789abcdef' pnpm --filter @turingcare/api exec vitest run src/email/templates.test.ts src/email/brief-email.test.ts src/auth-email.test.ts src/routes/dogs.test.ts -t "stores the validated request locale|keeps the English default|uses the stored brief locale|auth email wiring|email templates|renderBriefEmail"

 RUN  v2.1.9 /Users/elopenmike/.codex/worktrees/f7ae/TuringCare/apps/api

 ✓ src/email/templates.test.ts (6 tests) 2ms
 ✓ src/email/brief-email.test.ts (8 tests) 3ms
 ✓ src/routes/dogs.test.ts (62 tests | 59 skipped) 302ms
 ✓ src/auth-email.test.ts (7 tests) 476ms

 Test Files  4 passed (4)
      Tests  24 passed | 59 skipped (83)
```

PDF GREEN:

```text
$ NODE_OPTIONS='--no-experimental-webstorage' pnpm --filter @turingcare/web exec vitest run src/lib/brief-pdf-model.test.ts src/components/brief-pdf-document.test.tsx

 RUN  v2.1.9 /Users/elopenmike/.codex/worktrees/f7ae/TuringCare/apps/web

 ✓ src/lib/brief-pdf-model.test.ts (9 tests) 13ms
 ✓ src/components/brief-pdf-document.test.tsx (3 tests) 2ms

 Test Files  2 passed (2)
      Tests  12 passed (12)
```

## Stored-locale flow trace

- `POST /api/dogs/:id/brief`: `localeMiddleware` validates `X-TuringCare-Locale` / `Accept-Language` once and stores `c.get("locale")`.
- Brief generation calls `composeBrief(input, locale)` and inserts `{ locale, summary, version, status: "draft" }` into `briefs`.
- Legacy/default path: no locale header resolves to `en`; database default also remains `en`.
- `POST /api/dogs/:id/brief/send`: latest stored `brief.locale` is passed to `renderBriefEmail(..., brief.locale)` even if the send request carries a different current locale.
- PDF: `buildBriefPdfModel` uses `brief.locale ?? "en"` as source of truth and ignores current UI `locale` when a stored brief locale exists. It emits localized labels, status label, date, age, size/sex labels, title, and filename for the document.

## Auth raw-request validation trace

- Exported `resolveRequestLocale(request)` from `apps/api/src/middleware/locale.ts`.
- `localeMiddleware` now uses that resolver.
- Better Auth callbacks use the original second-argument `Request` only through `resolveRequestLocale`.
- Tests cover:
  - valid `X-TuringCare-Locale: es` overriding English `Accept-Language`;
  - invalid raw `X-TuringCare-Locale: fr` falling back to `Accept-Language: es-MX,es;q=0.8`;
  - password reset localized through `Accept-Language`.

## Escaping/security trace

- Entry points:
  - HTTP headers: `X-TuringCare-Locale`, `Accept-Language` validated by allowlist parser with max lengths, max values, q-value validation, and fallback to `en`.
  - Brief send JSON body: existing `briefSendSchema` continues to validate recipient email and optional message length.
  - User-authored persisted data: dog names, owner names, brief summaries, personal messages, concerns, goals, notes, skill names.
- Sinks:
  - SQL writes use Drizzle values/query builders, not string interpolation.
  - Email HTML templates call `escapeHtml` for URL/dog/owner/message/summary before interpolation.
  - Email text keeps user data as text data; no HTML interpretation.
  - PDF uses React PDF `<Text>` nodes with model strings; no HTML sink.
- Translation boundary:
  - Fixed chrome/prose, enum labels, plural branches, dates, status labels, and PDF labels are localized.
  - User-authored concern/goal/note/skill/message/summary/name values are not translated.
- Secret sweep:
  - `git diff -- ... | rg -n "(?i)(api[_-]?key|bearer|token|secret|password|credential|private[_-]?key)"` found only fixed test passwords (`password-123`) and password/reset/template code identifiers/text. No credentials or tokens were added.

## Verification

Focused and affected suites:

```text
$ DATABASE_URL='postgres://postgres:postgres@localhost:5432/turingcare' BETTER_AUTH_SECRET='test-only-insecure-secret-0123456789abcdef' pnpm --filter @turingcare/api exec vitest run src/lib/brief.test.ts src/routes/dogs.test.ts src/email/templates.test.ts src/email/brief-email.test.ts src/auth-email.test.ts src/middleware/locale.test.ts
 Test Files  6 passed (6)
      Tests  99 passed (99)

$ NODE_OPTIONS='--no-experimental-webstorage' pnpm --filter @turingcare/web exec vitest run src/lib/brief-pdf-model.test.ts src/components/brief-pdf-document.test.tsx src/routes/brief.test.tsx src/routes/shared-brief.test.tsx src/components/brief/share-sheet.test.tsx
 Test Files  5 passed (5)
      Tests  20 passed (20)
```

Fresh package suites after formatting:

```text
$ DATABASE_URL='postgres://postgres:postgres@localhost:5432/turingcare' BETTER_AUTH_SECRET='test-only-insecure-secret-0123456789abcdef' pnpm --filter @turingcare/api test
 Test Files  47 passed (47)
      Tests  320 passed (320)

$ NODE_OPTIONS='--no-experimental-webstorage' pnpm --filter @turingcare/web test
 Test Files  73 passed (73)
      Tests  301 passed (301)

$ pnpm --filter @turingcare/i18n test
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

Typechecks:

```text
$ DATABASE_URL='postgres://postgres:postgres@localhost:5432/turingcare' BETTER_AUTH_SECRET='test-only-insecure-secret-0123456789abcdef' pnpm --filter @turingcare/api typecheck
$ tsc --noEmit

$ NODE_OPTIONS='--no-experimental-webstorage' pnpm --filter @turingcare/web typecheck
$ tsc --noEmit

$ pnpm --filter @turingcare/i18n typecheck
$ tsc --noEmit
```

Hygiene:

```text
$ pnpm exec biome check apps/api/src/auth-email.test.ts apps/api/src/auth.ts apps/api/src/email/brief-email.test.ts apps/api/src/email/brief-email.ts apps/api/src/email/templates.test.ts apps/api/src/email/templates.ts apps/api/src/lib/brief.test.ts apps/api/src/lib/brief.ts apps/api/src/middleware/locale.ts apps/api/src/routes/dogs.test.ts apps/api/src/routes/dogs.ts apps/web/src/components/brief-pdf-document.test.tsx apps/web/src/components/brief-pdf-document.tsx apps/web/src/lib/brief-pdf-model.test.ts apps/web/src/lib/brief-pdf-model.ts
Checked 15 files in 23ms. No fixes applied.

$ git diff --check
```

Repo-wide `pnpm lint` still fails on pre-existing unrelated files not touched in this task:

- `apps/api/src/app.ts` import ordering
- `apps/api/src/monitoring/error-handler.ts` formatting
- `packages/i18n/src/index.ts` import ordering
- `packages/i18n/src/index.test.ts` `delete` lint
- `apps/web/src/components/turing-companion.test.tsx` import ordering
- `apps/web/src/i18n/index.tsx` import/format
- `apps/web/src/i18n/i18n.test.tsx` import ordering
- `apps/web/src/lib/api.test.ts` import/format

## Concerns

- Web full tests pass but emit existing React Suspense `act(...)` warnings in brief/share-sheet tests.
- Repo-wide lint remains blocked by unrelated pre-existing hygiene issues above; Task 4 files pass scoped Biome.

# Fix round 1 — Locale-stable shared/owned artifacts

## Review findings addressed

1. Public shared briefs now include the whitelisted `briefs.locale` field. No private `userId`, `dogId`, or `shareToken` fields were added to the public response.
2. Owned Brief page chrome now formats the stored artifact title, generated date, and draft/final status from `brief.locale`, not the current UI locale.
3. Spanish summary prose now localizes the daily check-in heading as `Registros diarios:`.
4. Owned/shared web tests now use locale-bearing mocks and assert opposite-UI/source behavior, including PDF download locale handoff.

## RED evidence

API RED after test-first changes:

```text
$ DATABASE_URL='postgres://postgres:postgres@localhost:5432/turingcare' BETTER_AUTH_SECRET='test-only-insecure-secret-0123456789abcdef' pnpm --filter @turingcare/api exec vitest run src/lib/brief.test.ts src/routes/share.test.ts

 RUN  v2.1.9 /Users/elopenmike/.codex/worktrees/f7ae/TuringCare/apps/api

 ❯ src/lib/brief.test.ts (7 tests | 1 failed) 7ms
   × composeBrief > renders Spanish fixed prose, enum labels, plural branches, and dates 4ms
     → expected 'Biscuit es una perra mediana Aussie.\…' to contain 'Registros diarios: 1 mejor, 1 igual, …'
 ❯ src/routes/share.test.ts (4 tests | 1 failed) 500ms
   × public GET /api/share/brief/:token > returns whitelisted fields for a valid token and 404 after revoke/for unknown 142ms
     → expected undefined to be 'es' // Object.is equality

 FAIL  src/lib/brief.test.ts > composeBrief > renders Spanish fixed prose, enum labels, plural branches, and dates
AssertionError: expected 'Biscuit es una perra mediana Aussie.\…' to contain 'Registros diarios: 1 mejor, 1 igual, …'

- Expected
+ Received

- Registros diarios: 1 mejor, 1 igual, 0 más difícil.
+ Biscuit es una perra mediana Aussie.
+ ...
+ Check-ins: 1 mejor, 1 igual, 0 más difícil.

 FAIL  src/routes/share.test.ts > public GET /api/share/brief/:token > returns whitelisted fields for a valid token and 404 after revoke/for unknown
AssertionError: expected undefined to be 'es' // Object.is equality

- Expected:
"es"

+ Received:
undefined

 Test Files  2 failed (2)
      Tests  2 failed | 9 passed (11)
```

Web RED after test-first changes:

```text
$ NODE_OPTIONS='--no-experimental-webstorage' pnpm --filter @turingcare/web exec vitest run src/routes/brief.test.tsx src/routes/shared-brief.test.tsx

 RUN  v2.1.9 /Users/elopenmike/.codex/worktrees/f7ae/TuringCare/apps/web

 ❯ src/routes/brief.test.tsx (5 tests | 2 failed) 117ms
   × Brief review > renders owned brief chrome from the stored Spanish locale even when the UI is English 10ms
     → Unable to find an element with the text: Resumen de conducta.
   × Brief review > keeps owned brief chrome English from the stored locale even when the UI is Spanish 3ms
     → Unable to find an element with the text: Behavior Brief.

 FAIL  src/routes/shared-brief.test.tsx > renders shared brief chrome and PDF handoff from stored Spanish locale under English UI
TestingLibraryElementError: Unable to find role="heading" and name "Resumen de conducta compartido"

 Test Files  2 failed (2)
      Tests  3 failed | 5 passed (8)
```

## Implementation trace

Stored-locale flow:

- New brief generation was already storing `briefs.locale`; this round consumes it in the public route by selecting `locale: briefs.locale` in `apps/api/src/routes/share.ts`.
- `apps/web/src/lib/shared-brief.ts` now models `locale: Locale` on `SharedBrief`.
- `apps/web/src/routes/shared-brief.tsx` uses `data.locale` for shared page title (`sharedBriefTitle`), version label (`briefVersionLabel`), and passes `locale: data.locale` into `BriefDownloadButton`.
- `apps/web/src/routes/brief.tsx` uses `brief.locale` for title (`briefTitle`), generated line (`briefGeneratedLabel`), and status/version (`briefStatusLabel`).
- `apps/web/src/components/brief/share-sheet.tsx` now types `brief.locale?: Locale`, preserving the already-passed owned brief object through to PDF download.
- `apps/web/src/lib/brief-chrome.ts` is framework-neutral and reads the shared `@turingcare/i18n` message catalogs directly; it does not create or duplicate an i18next runtime in React render paths.

Auth raw-request validation:

- No auth code changed in this fix round.
- The public share test generates a Spanish brief through the real API with `X-TuringCare-Locale: es`; the middleware-validated stored locale is then observed through the public share endpoint under an unauthenticated request.
- Existing `resolveRequestLocale(request)` remains the single strict raw-request resolver used by API middleware/auth email wiring.

Escaping/security trace:

- No new HTML interpolation sink was added.
- Public whitelist gained only `locale`; tests still assert absence of `userId`, `dogId`, and `shareToken`.
- User-authored content (`summary`, dog names, notes, concern/goal text) is still displayed/passed as data and is not translated.
- The web helper only selects fixed catalog strings and interpolates numeric `version` / formatted date strings; it does not interpret user-authored content as HTML.
- PDF handoff remains data-only through `BriefDownloadButton`/`buildBriefPdfModel`; the stored locale controls fixed PDF labels/chrome.

## Files changed

- `apps/api/src/lib/brief.ts`
- `apps/api/src/lib/brief.test.ts`
- `apps/api/src/routes/share.ts`
- `apps/api/src/routes/share.test.ts`
- `apps/web/src/lib/brief-chrome.ts` — new framework-neutral stored-locale chrome helper.
- `apps/web/src/lib/shared-brief.ts`
- `apps/web/src/routes/brief.tsx`
- `apps/web/src/routes/brief.test.tsx`
- `apps/web/src/routes/shared-brief.tsx`
- `apps/web/src/routes/shared-brief.test.tsx`
- `apps/web/src/components/brief/share-sheet.tsx`

## GREEN evidence

Focused post-fix runs:

```text
$ DATABASE_URL='postgres://postgres:postgres@localhost:5432/turingcare' BETTER_AUTH_SECRET='test-only-insecure-secret-0123456789abcdef' pnpm --filter @turingcare/api exec vitest run src/lib/brief.test.ts src/routes/share.test.ts

 RUN  v2.1.9 /Users/elopenmike/.codex/worktrees/f7ae/TuringCare/apps/api

 ✓ src/lib/brief.test.ts (7 tests) 4ms
 ✓ src/routes/share.test.ts (4 tests) 507ms

 Test Files  2 passed (2)
      Tests  11 passed (11)
   Start at  02:37:44
   Duration  1.50s (transform 151ms, setup 17ms, collect 756ms, tests 511ms, environment 0ms, prepare 132ms)

$ NODE_OPTIONS='--no-experimental-webstorage' pnpm --filter @turingcare/web exec vitest run src/routes/brief.test.tsx src/routes/shared-brief.test.tsx

 RUN  v2.1.9 /Users/elopenmike/.codex/worktrees/f7ae/TuringCare/apps/web

 ✓ src/routes/shared-brief.test.tsx (3 tests) 64ms
 ✓ src/routes/brief.test.tsx (6 tests) 102ms

 Test Files  2 passed (2)
      Tests  9 passed (9)
   Start at  02:37:44
   Duration  775ms (transform 114ms, setup 57ms, collect 482ms, tests 165ms, environment 313ms, prepare 90ms)
```

Affected full package suites:

```text
$ DATABASE_URL='postgres://postgres:postgres@localhost:5432/turingcare' BETTER_AUTH_SECRET='test-only-insecure-secret-0123456789abcdef' pnpm --filter @turingcare/api test

 Test Files  47 passed (47)
      Tests  320 passed (320)
   Start at  02:36:36
   Duration  8.86s (transform 734ms, setup 218ms, collect 28.18s, tests 20.54s, environment 5ms, prepare 2.22s)

$ NODE_OPTIONS='--no-experimental-webstorage' pnpm --filter @turingcare/web test

 Test Files  73 passed (73)
      Tests  305 passed (305)
   Start at  02:36:49
   Duration  6.90s (transform 1.38s, setup 2.77s, collect 15.51s, tests 10.92s, environment 18.05s, prepare 3.36s)

$ pnpm --filter @turingcare/i18n test

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  02:36:59
   Duration  187ms (transform 35ms, setup 0ms, collect 39ms, tests 4ms, environment 0ms, prepare 30ms)
```

Typechecks:

```text
$ DATABASE_URL='postgres://postgres:postgres@localhost:5432/turingcare' BETTER_AUTH_SECRET='test-only-insecure-secret-0123456789abcdef' pnpm --filter @turingcare/api typecheck
$ tsc --noEmit

$ NODE_OPTIONS='--no-experimental-webstorage' pnpm --filter @turingcare/web typecheck
$ tsc --noEmit

$ pnpm --filter @turingcare/i18n typecheck
$ tsc --noEmit
```

Hygiene:

```text
$ pnpm exec biome check apps/api/src/lib/brief.ts apps/api/src/lib/brief.test.ts apps/api/src/routes/share.ts apps/api/src/routes/share.test.ts apps/web/src/lib/brief-chrome.ts apps/web/src/lib/shared-brief.ts apps/web/src/routes/brief.tsx apps/web/src/routes/brief.test.tsx apps/web/src/routes/shared-brief.tsx apps/web/src/routes/shared-brief.test.tsx apps/web/src/components/brief/share-sheet.tsx
Checked 11 files in 5ms. No fixes applied.

$ git diff --check

$ rg -n "\.only\(|describe\.only|it\.only|test\.only|console\.log|debugger" apps/api/src apps/web/src packages/i18n/src
apps/api/src/index.ts:13:    console.log(`api listening on http://0.0.0.0:${info.port}`);
apps/api/src/telemetry/retention-cli.ts:9:    console.log(`[retention] deleted ${removed} events older than ${env.EVENT_RETENTION_DAYS}d`);
```

Repo-wide lint remains blocked by pre-existing unrelated files:

```text
$ pnpm -w lint
Found 11 errors.
```

Remaining root-lint files reported by Biome:

- `apps/api/src/app.ts` import ordering
- `apps/api/src/monitoring/error-handler.ts` formatting
- `packages/i18n/src/index.ts` import ordering
- `packages/i18n/src/index.test.ts` `delete` lint
- `apps/web/src/components/turing-companion.test.tsx` import ordering
- `apps/web/src/i18n/index.tsx` import/format
- `apps/web/src/i18n/i18n.test.tsx` import ordering
- `apps/web/src/lib/api.test.ts` import/format

## Concerns

- Full web tests pass but continue to emit existing React Suspense `act(...)` warnings in `brief.test.tsx` / `share-sheet.test.tsx`.
- Repo-wide lint is still blocked by the unrelated pre-existing Biome issues listed above; all files changed in this fix round pass scoped Biome.
