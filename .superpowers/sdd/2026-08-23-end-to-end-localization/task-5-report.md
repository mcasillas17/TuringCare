# Task 5 report — Training catalog and remaining UI system copy

## Status

Implemented Task 5 and committed only the task-scoped code/test/report changes.

## RED/GREEN

RED-first tests added:

- `apps/api/src/data/training-catalog.test.ts`
  - Spanish template/skill/level localization.
  - English/Spanish stable-key parity.
  - fresh localized structures so request mutations cannot leak.
  - unsupported locale fallback.
  - compatibility `trainingCatalog` export.
  - Initial RED: focused catalog test failed with `TypeError: getTrainingCatalog is not a function`.
- `apps/api/src/routes/training.test.ts`
  - Spanish `GET /api/training/templates` returns localized display text and `Content-Language: es`.
  - Initial RED: route returned English `Basic Manners`.
- `apps/api/src/routes/dogs.test.ts`
  - Spanish `POST /api/dogs/:id/goals/from-template` persists localized selected display names while preserving stable catalog keys, then `/progress` returns those persisted names.
  - Initial RED: route persisted English `Basic Manners`.
- Web Spanish/accessibility render tests:
  - `apps/web/src/components/admin-shell/AdminShell.test.tsx`
  - `apps/web/src/routes/admin/require-admin.test.tsx`
  - `apps/web/src/routes/admin/index.test.tsx`
  - `apps/web/src/routes/admin/trainers.test.tsx`
  - `apps/web/src/routes/admin/courses.test.tsx`
  - `apps/web/src/routes/admin/panels/events-over-time.test.tsx`
  - `apps/web/src/components/app-shell/AppShell.test.tsx`
  - `apps/web/src/routes/landing.test.tsx`
  - `apps/web/src/components/landing/site-nav.test.tsx`
  - `apps/web/src/components/landing/site-footer.test.tsx`
  - Initial RED: English admin/app-shell/landing labels still rendered, and Spanish admin/course/trainer copy was absent.

Focused GREEN after implementation:

- API focused: `76 passed`.
- Web focused: `39 passed`.

## Stable-key design

- Moved curated catalog display text into `packages/i18n/src/en.ts` and `packages/i18n/src/es.ts` under `trainingCatalog.templates`.
- `apps/api/src/data/training-catalog.ts` now keeps language-neutral template/skill definitions only:
  - template keys remain stable, e.g. `basic-manners`.
  - skill keys are derived as `${template.key}.${skillKey}`, e.g. `basic-manners.sit`.
  - levels remain numeric `1..5`.
- `getTrainingCatalog(locale)` builds a fresh `CatalogTemplate[]` from the selected locale on each call.
- Type safety/parity:
  - Spanish catalog must satisfy the recursive `Messages<typeof en>` shape.
  - template definitions are typed against real English catalog template/skill keys.
  - `MessageKey` is recursive so nested catalog/admin keys are typechecked.
- `trainingCatalog` remains as a compatibility export for the English catalog.

## Route/persistence trace

- `GET /api/training/templates`
  - uses `c.get("locale")`.
  - returns `getTrainingCatalog(locale)`.
  - Spanish request returns Spanish display fields and `Content-Language: es`.
- `POST /api/dogs/:id/goals/from-template`
  - uses `getTrainingCatalog(c.get("locale"))` before matching the selected template key.
  - persists localized display names/descriptions from the request locale.
  - preserves `catalogGoalKey` and `catalogSkillKey` as stable language-neutral keys.
  - does not translate user-authored/DB trainer/course records.

## UI copy localized

- Admin shell/nav/current section/back/sign-out/drawer labels/loading fallback.
- Admin dashboard range selector, loading/error states, KPI labels, panel headings, empty states, chart controls/category labels.
- Admin trainers/courses forms, buttons, tables, loading/error/empty states.
- Course/trainer option labels localize while raw form values remain stable (`group`, `any`, etc.).
- App-shell close-menu accessibility label.
- Landing nav/footer accessibility labels and Turing image alt text.

## Hardcoded-copy sweep

Commands used:

- Scoped production JSX text sweep:
  - `rg -n --glob '!*.test.*' ">[^<{]*[A-Za-z][^<{]*<" apps/web/src/components/admin-shell apps/web/src/routes/admin apps/web/src/components/app-shell apps/web/src/components/landing apps/web/src/routes/landing.tsx`
  - Meaningful result: no remaining fixed production UI text; one false positive in a sort comparator.
- Targeted English system-copy sweep:
  - no remaining quoted admin/app-shell/landing fixed-copy literals for the converted labels.
- Accessibility literal sweep:
  - no remaining literal `aria-label`, `alt`, or `title` values in the scoped production files.
  - verified replacements are `t(...)`-based for nav/footer/menus/Turing image alt labels.
- Training catalog English sweep:
  - English catalog display strings now live only in `packages/i18n/src/en.ts`, intentionally.

Intentional remnants:

- Stable route paths: `/admin`, `/admin/trainers`, `/admin/courses`, `/my`, `/login`.
- Storage/query keys: `tc-nav-expanded`, `tc-admin-nav-expanded`, `["admin", "metrics", days]`.
- Telemetry/event keys and chart data keys: `page.viewed`, `training.*`, `focus.*`, `dog.*`, `brief.*`, `user.*`, `total`, `count`, `bucket`, `DAU`, `WAU`, `MAU`.
- Raw form/schema values: `group`, `workshop`, `seminar`, `private`, `drop_in`, `puppy`, `adolescent`, `adult`, `any`.
- User-authored/fixture records in tests: `Jane Rivera`, `Pawsitive K9`, `Puppy Start Right`, `Seattle Humane`.
- Brand/copyright/mailto values: `TuringCare`, `TuringCare feedback`, `feedback@turingcare.dog`.
- Diagnostic-only thrown errors in hooks such as `metrics failed`; user-visible error states are localized.
- CSS classes, imports, icon names, component/type identifiers.

## Files changed

- API catalog/routes/tests:
  - `apps/api/src/data/training-catalog.ts`
  - `apps/api/src/data/training-catalog.test.ts`
  - `apps/api/src/routes/training.ts`
  - `apps/api/src/routes/training.test.ts`
  - `apps/api/src/routes/dogs.ts`
  - `apps/api/src/routes/dogs.test.ts`
- i18n runtime/catalogs:
  - `packages/i18n/src/en.ts`
  - `packages/i18n/src/es.ts`
  - `packages/i18n/src/index.ts`
- Web UI/tests:
  - `apps/web/src/components/admin-shell/AdminShell.tsx`
  - `apps/web/src/components/admin-shell/AdminShell.test.tsx`
  - `apps/web/src/components/admin-shell/admin-nav-items.ts`
  - `apps/web/src/components/app-shell/AppShell.tsx`
  - `apps/web/src/components/app-shell/AppShell.test.tsx`
  - `apps/web/src/components/landing/hero.tsx`
  - `apps/web/src/components/landing/site-nav.tsx`
  - `apps/web/src/components/landing/site-nav.test.tsx`
  - `apps/web/src/components/landing/site-footer.tsx`
  - `apps/web/src/components/landing/site-footer.test.tsx`
  - `apps/web/src/routes/landing.test.tsx`
  - `apps/web/src/routes/admin/index.tsx`
  - `apps/web/src/routes/admin/index.test.tsx`
  - `apps/web/src/routes/admin/require-admin.tsx`
  - `apps/web/src/routes/admin/require-admin.test.tsx`
  - `apps/web/src/routes/admin/trainers.tsx`
  - `apps/web/src/routes/admin/trainers.test.tsx`
  - `apps/web/src/routes/admin/courses.tsx`
  - `apps/web/src/routes/admin/courses.test.tsx`
  - `apps/web/src/routes/admin/panels/active-usage.tsx`
  - `apps/web/src/routes/admin/panels/event-category.ts`
  - `apps/web/src/routes/admin/panels/event-category.test.ts`
  - `apps/web/src/routes/admin/panels/events-over-time.tsx`
  - `apps/web/src/routes/admin/panels/events-over-time.test.tsx`
  - `apps/web/src/routes/admin/panels/feature-usage.tsx`
  - `apps/web/src/routes/admin/panels/funnel.tsx`
  - `apps/web/src/routes/admin/panels/growth.tsx`
  - `apps/web/src/routes/admin/panels/kpi-strip.tsx`
  - `apps/web/src/routes/admin/panels/top-pages.tsx`

## Verification

Full suites/typechecks/hygiene:

- `DATABASE_URL='postgres://postgres:postgres@localhost:5432/turingcare' BETTER_AUTH_SECRET='test-only-insecure-secret-0123456789abcdef' pnpm --filter @turingcare/api test -- --reporter=basic`
  - `47 passed`, `327 passed`.
- `NODE_OPTIONS='--no-experimental-webstorage' pnpm --filter @turingcare/web test -- --reporter=basic`
  - `73 passed`, `315 passed`.
- `pnpm --filter @turingcare/i18n test -- --reporter=basic`
  - `1 passed`, `7 passed`.
- `pnpm typecheck`
  - i18n, shared, API, web all passed.
- `git diff --name-only | xargs pnpm exec biome check`
  - checked 38 files, no fixes needed.
- `git diff --check`
  - passed.
- Cleanup/debug scan over touched files:
  - no `.only`, `.skip`, `debugger`, task-added `console.log`, TODO/FIXME, temporary flags, or trace residue.
- Secret scan over touched files:
  - no secrets. Matches were benign existing/token/password words in UI copy/tests and existing share-token implementation.

Notes:

- Web full suite still emits existing React `act(...)` warnings in brief/share-sheet tests; all tests pass and this task did not introduce those warnings.

## Concerns

No blocking concerns.
