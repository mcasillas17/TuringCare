# TuringCare — Dog Profile CRUD (sub-project C)

**Date:** 2026-05-17
**Status:** Approved (user reviewed the presented design and said "looks right",
accepting the flagged recommendations: add `react-hook-form` +
`@hookform/resolvers`; hard-delete-with-confirm). Ready for plan.
**Scope:** `packages/shared` + `apps/api` + `apps/web` (no DB migration — the
session-1 schema already has the tables). Delivered as a single PR from the
`worktree-dog-profile-crud` worktree.

## Goal

Let an authenticated user manage their dogs end-to-end: create / view / edit /
delete a dog's core profile, and add/remove that dog's behavior concerns and
training goals — all owner-scoped, all localized (English + Spanish). This is
the data foundation the ABC journal and Behavior Brief build on later.

## Existing context (session 1 — reuse, do not re-create)

- **Schema (already migrated, no change):** `dogs` (core profile),
  `behavior_concerns` (`concern` text + `severity` enum mild/moderate/severe),
  `training_goals` (`goal` text). FKs use `onDelete: "cascade"` (deleting a dog
  removes its concerns/goals — and later journal/briefs).
- **Validation:** `packages/shared/src/dog.ts` already exports
  `dogProfileSchema` (name, breed, dateOfBirth, size, weightLbs, sex,
  spayedNeutered, source, adoptedAt, vaccineStage, notes) + the enums
  (`dogSize`, `dogSex`, `dogSource`, `vaccineStage`). Reuse as-is.
- **API patterns:** `apps/api/src/app.ts` — Hono chained `.get/.post/...`,
  `@hono/zod-validator` `zValidator("json", schema)`, auth via
  `auth.api.getSession({ headers: c.req.raw.headers })`, typed JSON responses,
  `AppType` exported for the RPC client. Tests: `app.test.ts` uses
  `app.request()` in-memory.
- **Web patterns:** `apps/web/src/lib/api.ts` = `hc<AppType>` RPC client;
  TanStack Query; React Router v7 routes in `apps/web/src/routes/` mounted in
  `main.tsx` under `RequireAuth`; shadcn/ui; sonner toasts; i18n via
  `useI18n()`/`t()` with typed `en`/`es` catalogs (compile-time parity).
- The current `/app` route is a placeholder dumping `/me` JSON — it is
  **replaced** by the dog UI.

## Architecture

### Data model

Multi-dog per user. Every dog/concern/goal record is reachable only by its
owner. Ownership is enforced **server-side on every endpoint**: load the dog by
`:id`, confirm `dog.ownerId === session.user.id`, else 404 (not 403 — do not
reveal existence). Concern/goal endpoints first resolve the parent dog through
the same ownership check before mutating.

### Shared validation (`packages/shared/src/dog.ts`)

- `dogProfileSchema` — unchanged; used for `POST /api/dogs` and
  `PUT /api/dogs/:id`.
- Add `behaviorConcernSchema = z.object({ concern: z.string().min(1),
  severity: z.enum(["mild","moderate","severe"]) })`.
- Add `trainingGoalSchema = z.object({ goal: z.string().min(1) })`.
- Add inferred types `BehaviorConcernInput`, `TrainingGoalInput`. Export all
  through `packages/shared/src/index.ts`. Enum **values** stay canonical
  English in the DB; only display labels are localized (see i18n).

### API (`apps/api/src/app.ts`, extends the existing chained app)

All owner-scoped, JSON, typed for `hc<AppType>`. Unauthenticated → 401;
not-owner / missing → 404; zod failure → 400 (existing `zValidator` default).

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/dogs` | list the caller's dogs (newest first) |
| POST | `/api/dogs` | create a dog owned by the caller (body: `dogProfileSchema`) → 201 + dog |
| GET | `/api/dogs/:id` | the dog + its `concerns[]` + `goals[]` (owner-scoped) |
| PUT | `/api/dogs/:id` | update core profile (body: `dogProfileSchema`) |
| DELETE | `/api/dogs/:id` | hard-delete the dog (cascade removes children) |
| POST | `/api/dogs/:id/concerns` | add a concern (body: `behaviorConcernSchema`) → 201 + concern |
| DELETE | `/api/dogs/:id/concerns/:concernId` | remove that concern (must belong to the owned dog) |
| POST | `/api/dogs/:id/goals` | add a goal (body: `trainingGoalSchema`) → 201 + goal |
| DELETE | `/api/dogs/:id/goals/:goalId` | remove that goal (must belong to the owned dog) |

Queries via the existing `db` (Drizzle). Routes are added to the existing
chained `app` so `AppType` keeps inferring for the client. CORS/rate-limit
middleware already applies globally — no change.

### Web UI (`apps/web/src/routes/`)

Routes mounted in `main.tsx` inside `RequireAuth` (the placeholder `/app` JSON
dump is removed):

- `/app` — **Dog list**: a card per dog (name, breed, size) linking to detail;
  an "Add dog" action; a friendly empty state when the user has no dogs.
- `/app/dogs/new` — **Create form** (core profile fields; on success → detail).
- `/app/dogs/:id` — **Detail**: read-only profile summary; a **Concerns**
  section (list with per-item remove + an add control) and a **Goals** section
  (same shape); "Edit profile" link; "Delete dog" with a confirmation dialog
  (irreversible — states that concerns/goals are also removed).
- `/app/dogs/:id/edit` — **Edit form** (core profile; on success → detail).

Forms use `react-hook-form` + `@hookform/resolvers` with the shared zod schema
(`dogProfileSchema`). Data via TanStack Query (queries + mutations with cache
invalidation on the `["dogs"]` / `["dogs", id]` keys). shadcn/ui primitives;
sonner toasts for success/error. The existing authed-shell affordances
(`LanguageToggle`, sign-out) are preserved on these screens.

### i18n (hard requirement)

Every new user-facing string is rendered via `t()` with keys added to **both**
`apps/web/src/i18n/en.ts` and `apps/web/src/i18n/es.ts`. The compile-time
parity type makes a missing Spanish key a build error; the existing runtime
parity + no-untranslated tests continue to apply. New catalog area `dogs.*`
covering: list/empty/add labels, every field label, **enum option labels**
(size, sex, source, vaccineStage, concern severity), section headings, form
actions, the delete-confirmation copy, validation/error fallbacks, and toast
messages. Agent writes idiomatic Spanish consistent with the established
glossary (e.g. "perro", "adiestrador/a"). No hardcoded English in new UI.
`<html lang>`/meta/OG behavior is unchanged from sub-project B.

## Error handling

- Server: 401 unauthenticated; 404 for not-found *or* not-owned (no existence
  leak); 400 zod validation (existing `zValidator` envelope); 500s surfaced as
  a generic localized toast on the client (server message preferred when
  present, mirroring the auth-route toast pattern from sub-project B).
- Client: TanStack Query error states → localized toast + inline form errors
  from the zod resolver; optimistic UI not required (simple invalidate-refetch).
- Delete: confirmation dialog required before the DELETE call; the dialog copy
  states the action is permanent and also removes the dog's concerns/goals.

## Testing / verification

- **shared:** unit tests for `behaviorConcernSchema` / `trainingGoalSchema`
  (valid, missing required, bad enum) mirroring `dog.test.ts`.
- **api:** `app.request()` tests — unauthenticated→401; **owner isolation**
  (user A cannot GET/PUT/DELETE user B's dog, nor add/remove its concerns/goals
  → 404); create/list/get/update/delete happy paths; concern & goal add+remove;
  zod rejection→400. Owner isolation is the security-critical case and must be
  explicitly tested for every mutating endpoint.
- **web:** a render test for the dog list (empty + populated) and a
  create-flow test (jsdom, English default); existing i18n parity/no-untranslated
  and landing tests stay green.
- **Gates (every commit / final):** `pnpm -r exec tsc --noEmit`,
  `pnpm -r test`, `pnpm -r build`, `pnpm lint` — all green. `apps/api` infra
  (fly.toml, Dockerfile) unchanged.

## Out of scope / unchanged

ABC journal entries, Behavior Brief generation, trainer directory, sharing/PDF
export, dog photo upload, soft-delete/undo, pagination/search of the dog list,
per-account locale sync, the marketing site, auth/rate-limit, DB schema/
migrations. No `apps/api` infra change.

## Flagged decisions (reasonable; reviewable)

- **New web deps:** `react-hook-form` + `@hookform/resolvers` (small, standard,
  pairs with the existing zod schema). This adds to
  `apps/web/package.json`/lockfile (the only intended dependency change in this
  sub-project). Accepted by the user at design review.
- **Hard delete + confirmation dialog**, no soft-delete/undo this slice
  (FK cascade already defined in the schema). Accepted at design review.
- **404 (not 403) for not-owned** records to avoid existence disclosure.
- **Delivery:** single PR from the `worktree-dog-profile-crud` worktree via
  `superpowers:finishing-a-development-branch` (Pull Request option), per the
  user's new worktree/PR workflow.
