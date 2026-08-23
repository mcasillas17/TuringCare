# TuringCare — Spanish / i18n (sub-project B)

**Date:** 2026-05-17
**Status:** Approved design — parked behind the Turing-photo tweak; ready for implementation plan after it.
**Scope:** `apps/web` frontend only. No backend, no new runtime deps, no routing change, no `users.locale`.

> **Historical design, superseded 2026-08-23:** This document accurately records the
> frontend-only first release. Current localization uses shared `@turingcare/i18n` catalogs,
> i18next/react-i18next, validated API locale middleware, and nullable account persistence;
> see `2026-08-23-end-to-end-localization-design.md` and `../../LOCALIZATION.md`.

## Goal

Make the entire web UI available in **English (default) and Spanish**, with
browser-locale detection, a manual switcher, and the choice remembered in the
browser. All current user-facing copy is translated; the agent writes the
Spanish.

## Approved Decisions

- **Mechanism:** lightweight **in-house** i18n (typed catalogs + Context + `t()`).
  No runtime dependency (`react-i18next`/`react-intl` rejected as overkill for
  two languages of mostly-static copy).
- **Language selection:** browser-detect on first visit (`navigator.language(s)`
  starts with `es` → Spanish, else English) + a visible manual switcher;
  choice persisted.
- **Persistence:** `localStorage` only (no `users.locale` DB column — keeps this
  frontend-only and fast; per-account sync is a possible later increment).
- **Translation scope/source:** every existing user-facing string; agent writes
  idiomatic Spanish (dog-training tone; the "positive reinforcement" framing
  preserved). Owner can refine wording later.

## Architecture

### Catalogs — typed, compile-time parity

- `apps/web/src/i18n/en.ts` — source-of-truth `const en = { … } as const`.
- `apps/web/src/i18n/es.ts` — `const es: Messages = { … }` where
  `type Messages = typeof en`. A missing/extra Spanish key is a **TypeScript
  error** → automatic completeness, no drift. (JSON catalogs rejected: no parity
  guarantee.)
- Keys nested by area: `nav`, `hero`, `howItWorks`, `briefSpotlight`,
  `philosophy`, `trainers`, `faq`, `footer`, `auth` (`login`/`register`),
  `app`, `common`.

### Runtime — `apps/web/src/i18n/index.ts`

- `LocaleProvider` (React context: `locale: "en" | "es"`, `setLocale`, `t`),
  mounted at the root in `main.tsx` **wrapping the router**.
- `useI18n()` → `{ t, locale, setLocale }`.
- `t("hero.headline", { name })` — typed dot-path key (a key-path type derived
  from `Messages` for autocomplete/safety), simple `{var}` interpolation.
- Resolution order at init: `localStorage["tc-locale"]` if a valid
  `"en"|"es"`; else `navigator.languages`/`navigator.language` first entry
  `startsWith("es")` → `"es"`; else `"en"`.
- `setLocale(l)` updates state, writes `localStorage["tc-locale"]`, and sets
  `document.documentElement.lang = l` (a11y).
- Fail-safe: unknown key → return the key string (dev-visible, no throw);
  invalid/absent locale or provider → English. All `window`/`localStorage`/
  `navigator`/`document` access guarded for jsdom/node.

### Language switcher

- `apps/web/src/components/LanguageToggle.tsx` — compact brand-styled `EN | ES`
  control (slate text, copper active accent), calls `setLocale`.
- Rendered in `SiteNav` (landing top bar). Auth/app pages
  (`/login`, `/register`, `/app`, `require-auth`) don't render `SiteNav`, so a
  small top-right instance of the same toggle is added there too, so language
  is changeable on every screen.

### Wiring

Replace every hardcoded user-facing string with `t(...)` in: the 8 landing
components (`site-nav`, `hero`, `how-it-works`, `brief-spotlight`, `philosophy`,
`trainers-teaser`, `faq`, `site-footer`), `routes/login.tsx`,
`routes/register.tsx`, `routes/app.tsx`, `routes/require-auth.tsx`, and the
sonner toast strings. English catalog = current copy verbatim (post copy-rephrase
+ landing-tweaks state); Spanish = agent translations.

## Out of Scope / Unchanged

`index.html` `<meta>`/Open Graph/Twitter and `og.png` stay English (crawlers
don't localize per-viewer; only `<html lang>` flips client-side for a11y). No
backend/auth/schema/route change. No `users.locale`. No new dependency. The
Turing image, OG card, rate limiting, etc. unaffected.

## Error Handling

Pure client state, no network. Unknown key → key string; unknown/absent locale
or missing provider → English; storage/`navigator`/`document` access guarded so
tests (node/jsdom) and SSR-style contexts don't crash.

## Testing (proportionate, existing jsdom/Vitest)

- Detection: `navigator.language="es-ES"` → `es`; `localStorage["tc-locale"]`
  overrides browser; default `en` when neither indicates Spanish.
- `t()`: dot-path resolution, `{var}` interpolation, missing-key returns key.
- Render: toggling locale swaps a known hero string EN↔ES.
- Parity: a runtime deep-key-equality test of `es` vs `en` (belt-and-suspenders;
  the `es: Messages` type already enforces it at compile time).
- `landing.test.tsx`: **wrapper-only** change — wrap `setup()` in
  `LocaleProvider`; jsdom `navigator.language` resolves to English so existing
  English assertions keep passing (no assertion edits).

## Verification

- Toggle flips all wired copy EN↔ES live; refresh persists the choice;
  first-visit Spanish browser → Spanish; `<html lang>` updates.
- `pnpm --filter @turingcare/web test|typecheck|build`, `pnpm lint`,
  `pnpm -r exec tsc --noEmit`, `pnpm -r build` all green; `es: Messages`
  compiles (parity enforced).
- Scope: only `apps/web/*` + this spec/plan + PROJECT-LOG; no
  `package.json`/`pnpm-lock.yaml`, no `apps/api`.

## Flagged Decisions (reasonable; reviewable)

- Two locales now (`en`/`es`); the catalog/type structure trivially extends to
  more later.
- Toggle placement: `SiteNav` + a small instance on auth/app pages (no global
  chrome exists for non-landing routes); reviewable.
- Agent-authored Spanish is a first idiomatic pass; copy refinements are
  expected and cheap (catalog-only edits).
