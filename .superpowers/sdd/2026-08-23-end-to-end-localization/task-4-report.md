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
