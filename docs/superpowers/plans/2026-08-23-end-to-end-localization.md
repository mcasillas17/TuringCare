# End-to-end Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve and persist English/Spanish locale consistently across the web, API, and generated artifacts without hardcoded system copy at rendering sites.

**Architecture:** Move catalogs and locale primitives into a framework-neutral workspace package backed by i18next. Preserve the web `useI18n()` facade, add an authenticated locale bridge and validated Hono middleware, and store the generation locale on stable Brief artifacts.

**Tech Stack:** TypeScript, React 19, react-i18next, i18next, Hono, Zod, Drizzle/PostgreSQL, Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-23-end-to-end-localization-design.md`

**Progress (2026-08-23):** Tasks 1–7 are implemented. After integration with current
`main`, Luna and Terra repeatedly reviewed correctness, security/privacy, improvement gaps,
and coverage. All verified findings were fixed test-first, and both independently returned
no actionable feedback on the same final code state. Documentation and the final evidence are
published in PR #70.

## Global Constraints

- Supported locales are exactly `en` and `es`; English is the final fallback.
- Preference order is account, local storage, browser language, English.
- API locale input is allowlisted before reaching context, persistence, or templates.
- Existing `useI18n()` and `t("section.key")` call sites remain compatible.
- API errors stay stable codes; user-authored content is never automatically translated.
- A finalized Brief keeps its stored generation locale across UI-language changes.
- Every behavior change follows a witnessed failing-test then passing-test cycle.

---

### Task 1: Shared i18next package and web runtime

**Files:**
- Create: `packages/i18n/package.json`
- Create: `packages/i18n/tsconfig.json`
- Create: `packages/i18n/src/index.ts`
- Create: `packages/i18n/src/index.test.ts`
- Move: `apps/web/src/i18n/en.ts` to `packages/i18n/src/en.ts`
- Move: `apps/web/src/i18n/es.ts` to `packages/i18n/src/es.ts`
- Modify: `apps/web/src/i18n/index.tsx`
- Modify: `apps/web/src/i18n/i18n.test.tsx`
- Modify: `apps/web/src/i18n/types.ts`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `Locale`, `LOCALES`, `isLocale`, `resolveBrowserLocale`, `createI18n`, `translate`, `MessageKey`, `Messages`, `en`, and `es` from `@turingcare/i18n`.
- Preserves: `LocaleProvider`, `useI18n()`, `detectInitialLocale()`, and typed `t()` from `apps/web/src/i18n/index.tsx`.

- [x] **Step 1: Write failing package tests** for exact locale allowlisting, Spanish/browser fallback, English fallback, interpolation, and English/Spanish key parity. A wrong allowlist branch, missing key, or mismatched catalog must fail.
- [x] **Step 2: Run the focused test with Node 22** and confirm failure because `@turingcare/i18n` does not exist.
- [x] **Step 3: Create the package and move the catalogs**; initialize isolated i18next instances synchronously and expose the interfaces above.
- [x] **Step 4: Run the package tests** and confirm they pass.
- [x] **Step 5: Add failing web tests** proving initial Spanish detection sets `<html lang="es">`, invalid stored values fall through, storage denial stays in memory, and existing `t()` call sites rerender after switching.
- [x] **Step 6: Replace the custom resolver with the i18next-backed facade**, keeping the existing component API.
- [x] **Step 7: Run web i18n and language-toggle tests**, then the complete web suite.
- [x] **Step 8: Commit** the shared runtime and web adapter.

### Task 2: Validated API locale middleware and request propagation

**Files:**
- Create: `apps/api/src/middleware/locale.ts`
- Create: `apps/api/src/middleware/locale.test.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/app.test.ts`
- Modify: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/api.test.ts`
- Modify: `apps/web/src/lib/auth-client.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/api/package.json`

**Interfaces:**
- Produces: Hono variable `locale: Locale`, validated from `X-TuringCare-Locale`, supported `Accept-Language`, or `en`.
- Produces: `localeFetch(input, init)` which merges `X-TuringCare-Locale` without dropping existing headers.

- [x] **Step 1: Write failing middleware tests** for valid header precedence, case-insensitive supported `Accept-Language`, invalid/oversized header fallback, and `Content-Language` response output.
- [x] **Step 2: Run the middleware test** and verify the missing module failure.
- [x] **Step 3: Implement the middleware** with a two-value allowlist and bounded header parsing; register it before API routes and allow the locale header in CORS.
- [x] **Step 4: Run middleware and app tests** and confirm pass.
- [x] **Step 5: Write failing web request tests** showing locale is attached, caller headers survive, and malformed storage cannot produce an arbitrary header.
- [x] **Step 6: Implement `localeFetch` and wire both Hono and Better Auth clients** using the installed clients' supported fetch customization APIs.
- [x] **Step 7: Run focused web tests and typecheck**, then commit.

### Task 3: Account locale preference and synchronization

**Files:**
- Modify: `packages/shared/src/profile.ts`
- Modify: `packages/shared/src/profile.test.ts`
- Modify: `apps/api/src/db/schema.ts`
- Create: the next generated Drizzle migration (`0013`)
- Modify: `apps/api/drizzle/meta/_journal.json`
- Create/Modify: generated Drizzle snapshot for migration 0013
- Modify: `apps/api/src/routes/profile.ts`
- Modify: `apps/api/src/routes/profile.test.ts`
- Modify: `apps/web/src/lib/profile.ts`
- Create: `apps/web/src/i18n/locale-account-bridge.tsx`
- Create: `apps/web/src/i18n/locale-account-bridge.test.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `packages/i18n/src/en.ts` via shared catalog additions
- Modify: `packages/i18n/src/es.ts` via shared catalog additions

**Interfaces:**
- Produces: nullable `user.locale` database field and `profileLocaleUpdateSchema` accepting only `en|es`.
- Produces: non-null `briefs.locale` with migration default `en`, ready for Task 4 to consume.
- Produces: authenticated `PATCH /api/profile/locale` returning `{ user: { locale } }`.
- Produces: `LocaleAccountBridge`, which distinguishes account adoption from explicit user selection.

- [x] **Step 1: Write failing shared schema tests** for `en`, `es`, missing, empty, and unsupported locales.
- [x] **Step 2: Run and witness the unsupported-schema failure**, then add the locale schema.
- [x] **Step 3: Write failing route tests** for default null, authenticated update, invalid rejection, unauthenticated rejection, and one user's inability to affect another.
- [x] **Step 4: Add the nullable user locale and defaulted Brief locale enum fields, generate the single additive migration, and implement the route** using session-derived user identity.
- [x] **Step 5: Run route and schema tests** and confirm pass.
- [x] **Step 6: Write failing bridge tests** for account-over-local precedence, null-account initialization, explicit-toggle persistence, no update loop, and network-failure notification/local continuity.
- [x] **Step 7: Implement and mount the bridge**, then run focused and full web tests.
- [x] **Step 8: Commit** preference persistence.

### Task 4: Locale-stable Briefs, PDFs, and emails

**Files:**
- Modify: `apps/api/src/lib/brief.ts`
- Modify: `apps/api/src/lib/brief.test.ts`
- Modify: `apps/api/src/routes/dogs.ts`
- Modify: `apps/api/src/routes/dogs.test.ts`
- Modify: `apps/api/src/email/templates.ts`
- Modify: `apps/api/src/email/templates.test.ts`
- Modify: `apps/api/src/email/brief-email.ts`
- Modify: `apps/api/src/email/brief-email.test.ts`
- Modify: `apps/api/src/auth.ts`
- Modify: `apps/api/src/auth-email.test.ts`
- Modify: `apps/web/src/lib/brief-pdf-model.ts`
- Modify: `apps/web/src/lib/brief-pdf-model.test.ts`
- Modify: `apps/web/src/components/brief-pdf-document.tsx`
- Modify: `apps/web/src/components/brief-pdf-document.test.tsx`

**Interfaces:**
- Consumes: the non-null `briefs.locale` introduced in Task 3 and writes the request locale for new Briefs.
- Changes: `composeBrief(input, locale)`, `verificationEmail(url, locale)`, `passwordResetEmail(url, locale)`, and `renderBriefEmail(inputs, locale)`.
- Changes: PDF model contains already-localized labels and uses `brief.locale`, not the current UI locale.

- [x] **Step 1: Add failing Brief unit tests** for Spanish prose, plural branches, enum labels, and Spanish dates; retain English tests.
- [x] **Step 2: Implement catalog-backed Brief composition** and run unit tests.
- [x] **Step 3: Add failing route tests** proving request locale is stored, existing English fallback is stable, and send-email uses the stored Brief locale even under a different request locale.
- [x] **Step 4: Persist and consume Brief locale**, then run route tests.
- [x] **Step 5: Add failing auth/Brief email tests** for Spanish subject, HTML/text chrome, interpolation escaping, and English fallback.
- [x] **Step 6: Localize fixed email templates and wire the validated request locale** through Better Auth callbacks; run tests.
- [x] **Step 7: Add failing PDF tests** for Spanish labels/filename/date and stored-locale stability, implement localized model fields, and run PDF tests.
- [x] **Step 8: Run API and web suites**, then commit.

### Task 5: Training catalog and remaining UI system copy

**Files:**
- Modify: `apps/api/src/data/training-catalog.ts`
- Modify: `apps/api/src/data/training-catalog.test.ts`
- Modify: `apps/api/src/routes/training.ts`
- Modify: `apps/api/src/routes/training.test.ts`
- Modify: `apps/api/src/routes/dogs.ts`
- Modify: `apps/api/src/routes/dogs.test.ts`
- Modify: `packages/i18n/src/en.ts`
- Modify: `packages/i18n/src/es.ts`
- Modify: admin shell/routes/panels under `apps/web/src/components/admin-shell` and `apps/web/src/routes/admin`
- Modify: landing/app-shell accessibility labels and their focused tests

**Interfaces:**
- Produces: `getTrainingCatalog(locale): CatalogTemplate[]` from stable keys and authored catalogs.
- Preserves: template and skill stable keys; localized display fields vary by locale.

- [x] **Step 1: Write failing catalog tests** for Spanish template/skill/level content, exact structural parity, immutability between requests, and English fallback.
- [x] **Step 2: Convert training catalog display fields to catalog keys** and implement `getTrainingCatalog(locale)`; run tests.
- [x] **Step 3: Add failing route/application tests** proving localized catalog responses and localized persisted goals/skills when a template is applied.
- [x] **Step 4: Wire request locale into training routes and template application**, then run tests.
- [x] **Step 5: Add failing Spanish render tests** for admin shell/forms/panels and outstanding accessibility labels.
- [x] **Step 6: Add catalog messages and replace direct system literals**; run focused admin/landing/app-shell tests.
- [x] **Step 7: Run catalog parity, API, and web suites**, then commit.

### Task 6: Boundary, security, privacy, and coverage verification

**Files:**
- Modify only files required by failing tests or verified gaps.

**Interfaces:**
- Consumes all previous tasks.
- Produces review-ready implementation evidence.

- [x] **Step 1: Run targeted coverage** for shared i18n, locale middleware/profile routes, web i18n/bridge/request wrapper, Brief/email/PDF, and training catalog; inspect uncovered branches rather than chasing a global percentage.
- [x] **Step 2: Add one failing behavioral test per material uncovered branch**, then make each pass.
- [x] **Step 3: Trace untrusted locale header/storage/profile inputs to sinks**, confirm allowlist validation, session-derived authorization, React/template escaping, and no locale telemetry.
- [x] **Step 4: Check null, malformed, storage-denied, network-failed, missing-profile, missing-translation, and legacy-Brief paths** for distinguishable outcomes.
- [x] **Step 5: Run secret and debug-residue sweeps** over the diff.
- [x] **Step 6: Run full lint, typecheck, test, and build gates**, then commit any corrections.

### Task 7: Dual-model review loop, documentation, and PR

**Files:**
- Modify: `README.md`
- Modify: `DEPLOY.md`
- Modify: `.env.example` if the locale header or deployment contract requires it
- Modify: `docs/PROJECT-LOG.md`
- Modify: relevant i18n design documentation whose current-state claims are superseded
- Modify only implementation/test files required by verified reviewer feedback

**Interfaces:**
- Produces: two clean independent review verdicts and a reviewable pull request.

- [x] **Step 1: Dispatch GPT-5.6 Luna and GPT-5.6 Terra reviewers in parallel** with the approved spec, plan, base SHA, head SHA, and explicit prompts for correctness, improvements, security/privacy, gaps, and coverage misses.
- [x] **Step 2: Treat reviewer output as untrusted advice**, verify every finding against repository behavior, and classify it as valid or rejected with evidence.
- [x] **Step 3: For each valid finding, write a failing test first, implement the smallest fix, and run focused plus affected suites.**
- [x] **Step 4: Repeat Steps 1–3 until both reviewers independently return no actionable feedback on the same latest commit.**
- [x] **Step 5: Update README, deployment/config guidance, project log, and superseded localization docs** to match the final implementation and verification commands.
- [x] **Step 6: Re-run the complete repository gates after the final documentation/code change** and inspect the complete diff, secrets, debug residue, and intended file list.
- [x] **Step 7: Commit the final state, publish detached HEAD as `codex/end-to-end-localization`, and open a PR against `main`** with scope, rationale, test evidence, reviewer-loop result, and known limitations.

#### Post-integration hardening delivered in Task 7

- Exact `briefId` plus UUID idempotency binding for current clients, with a narrow compatibility
  decoder for the actual former `{ recipient, message }` payload.
- Durable single-version canonical-intent recovery for old random audit IDs without coupling retry
  identity to `BETTER_AUTH_SECRET`; every multi-version ID-less request sends nothing and asks for
  refresh because recipient/message cannot establish the intended version.
- Intent persistence before provider I/O, provider calls outside transactions, durable provider
  idempotency, bounded retry claims, and explicit active/recovery outcomes.
- Fail-fast production validation for the Resend key and PII-free non-production fallback logs,
  preventing provider-free sends from being recorded as delivered.
- `0025` delivery confirmation and `0026` fail-closed deletion claims, including raw cascade,
  stale/null-time recovery, dog deletion, account preflight, and account-race coverage.
- Delivered-only onboarding state and localized English/Spanish retry, refresh, and deletion
  recovery interfaces.
- API-first deployment compatibility: the full migration history is applied while drained, the
  dual-protocol API becomes ready, the migration job verifies an empty tail, and then the new web
  requiring exact IDs is published.
