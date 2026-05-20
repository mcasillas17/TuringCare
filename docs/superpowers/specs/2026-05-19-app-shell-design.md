# TuringCare — App Shell + Journal + Brief + Trainers + Profile + Settings (sub-project D)

**Date:** 2026-05-19
**Status:** Approved (user reviewed the presented design + visual mockups —
chose Layout B icon-rail, approved the Overview, requested the shared brand
banner on landing/shell/login/register, and approved the full design). Ready
for plan.
**Scope decision (explicit):** The user was twice advised to decompose this
into sequential sub-projects and twice chose a single combined effort. Per that
explicit, informed instruction this is **one spec → one plan → one PR**
covering all areas. Internal-quality mitigation: the implementation plan is
decomposed into many small TDD tasks, each with its own spec-compliance +
code-quality review (subagent-driven-development). No DB migration (every table
exists from session 1). No new runtime dependencies. Ships from the
`worktree-app-shell-redesign` worktree as one PR.

## Goal

Replace the ad-hoc authenticated screens with a real **app shell**: a
persistent icon-rail navigation + top brand banner + responsive content area,
and build out every nav destination — Overview, Dogs (re-homed), Behavior
Journal, Behavior Brief, Trainers directory, Profile, Settings — plus a shared
brand mark reused on the landing nav and the login/register pages.

## Existing context (reuse; do not re-create)

- **Routes today** (`apps/web/src/main.tsx`): `/`, `/login`, `/register`,
  `/app` (`DogsList`), `/app/dogs/new|:id|:id/edit`, `/admin`
  (`RequireAdmin` → lazy `AdminDashboard`). Each authed screen renders its own
  ad-hoc top-right `LanguageToggle` and (DogsList) a sign-out button.
- **Data model (all tables already migrated, session 1 + admin-telemetry):**
  `user` (id,text pk; name; email; role enum from admin-telemetry), `dogs`,
  `behavior_concerns`, `training_goals`, `journal_entries`
  (id; dogId→dogs cascade; occurredAt tstz; antecedent; behavior; consequence;
  intensity int CHECK 1..5; durationSeconds?; recoverySeconds?; location?;
  peoplePresent?; ownerResponse?; notes?; createdAt), `briefs`
  (id; dogId→dogs cascade; generatedAt; status enum draft|finalized default
  draft; summary text; version int default 1), `trainers`
  (id; name; businessName?; city; state; methodologyTags text[]; certifications
  text[]; specialties text[]; website?; email?; phone?; notesInternal?;
  timestamps). **No schema/migration change in this sub-project.**
- **API patterns** (`apps/api/src/app.ts` + `apps/api/src/routes/dogs.ts`):
  single chained Hono app; sub-routers mounted via
  `.route("/api/x", xApp)` so `AppType` keeps inferring; `requireUser`
  middleware (401 if no session, sets `userId`); `findOwnedDog(userId,id)`
  ownership helper returning the row or null (404, never 403). zod via
  `@hono/zod-validator`; shared schemas in `@turingcare/shared`. Numeric
  columns are drizzle `string` on write (the `weightLbs` precedent).
- **Web**: `hc<AppType>` client (now sends `credentials:"include"`),
  TanStack Query, React Router v7, shadcn primitives
  (`button,card,form,input,label,accordion,sonner`), i18n typed `en`/`es`
  catalogs with compile-time + runtime parity tests, `RequireAuth`,
  `RequireAdmin`, `useSession`.
- **Brand mark** lives inline in `apps/web/src/components/landing/site-nav.tsx`
  (lucide `PawPrint` in a slate badge + "TuringCare" wordmark).

## Architecture

### Shared brand mark

Extract the wordmark into one component
`apps/web/src/components/BrandMark.tsx` (`<BrandMark />`, optional `className`):
the lucide `PawPrint` slate badge + "TuringCare" text, byte-equivalent to the
current `site-nav` markup. Consumers (refactor to use it, no visual change):
landing `site-nav`, the new app-shell banner, `/login`, `/register`. Single
source of truth so the brand can't drift.

### App shell

`apps/web/src/components/app-shell/AppShell.tsx` — a layout component rendered
once as a React Router **layout route** wrapping every `/app/*` child via
`<Outlet/>`, the whole layout route wrapped in `RequireAuth`. Structure:

- **Top banner** (full width): `<BrandMark/>` (links to `/app`) · the current
  page title · right side `LanguageToggle` + **Sign out** (moved here from
  individual screens; sign-out = existing `signOut()` → toast → `/login`).
- **Left icon rail (Layout B)**: icons-only by default; a toggle expands it to
  icon+label; expanded/collapsed boolean persisted in `localStorage`
  (`tc-nav-expanded`). Items in order: Overview (`/app`), Dogs (`/app/dogs`),
  Journal (`/app/journal`), Behavior Brief (`/app/brief`), Trainers
  (`/app/trainers`), Profile (`/app/profile`), Settings (`/app/settings`),
  and **Admin** (`/admin`) rendered **only** when the session user is an admin
  (reuse the admin-telemetry `role`/admin check used by `RequireAdmin`; expose
  it as a small hook/util — do not duplicate logic). Active item = copper
  accent based on the current route.
- **Responsive**: below Tailwind `md`, the rail collapses into a hamburger
  drawer (overlay); the banner remains. Lucide icons; brand palette (slate
  rail, cream banner, copper active).
- Each child route sets its page title via a tiny shared mechanism (a
  `usePageTitle(t("…"))` hook writing into shell context, or the shell derives
  the title from the route — implementer picks the simpler; title strings are
  i18n keys).

### Routing restructure (`apps/web/src/main.tsx`)

Replace the flat `/app*` routes with a nested layout route:
`<Route element={<RequireAuth><AppShell/></RequireAuth>}>` containing children:
`index`→Overview, `dogs`/`dogs/new`/`dogs/:id`/`dogs/:id/edit` (existing
components, chrome stripped), `journal`, `brief`, `dogs/:id/brief`,
`trainers`, `trainers/:id`, `profile`, `settings`. `/admin` stays as-is
(its own `RequireAdmin` + lazy dashboard) — **not** inside the shell for this
sub-project (the admin dashboard owns its own layout; only a *link* to it
appears in the rail for admins).

### Feature areas (MVP-bounded)

**Overview (`/app`)** — new owner-scoped `GET /api/overview` →
`{ dogCount, journalEntryCount, latestBrief: {id,dogId,dogName,status}|null,
recentActivity: Array<{dogName,behavior,occurredAt}> }` where `recentActivity`
= the up-to-5 most recent `journal_entries` across the caller's dogs (newest
first). UI: greeting, 3 stat tiles (dogs / journal entries / latest Brief
status), your-dogs cards (reuse the dogs query; +Add link), recent-activity
list, quick-action links (Log behavior→/app/journal, Add dog→/app/dogs/new,
Generate Brief→/app/brief, Find a trainer→/app/trainers). All links; empty
states for no dogs / no activity.

**Dogs (`/app/dogs*`)** — existing `DogsList`/`DogDetail`/`DogForm` moved under
the shell: **remove** their in-component `LanguageToggle` and the DogsList
sign-out button (the shell provides both); keep all data/logic/tests behavior.
Adjust any internal links to the new nested paths if needed.

**Behavior Journal (`/app/journal`)** — top-level page with a **dog selector**
(dropdown of the caller's dogs; empty state if none). For the selected dog:
list entries newest-first (Antecedent → Behavior → Consequence, intensity 1–5,
`occurredAt`, optional location/notes); a create-entry form; delete an entry.
MVP form fields = `occurredAt` (datetime-local), `antecedent`, `behavior`,
`consequence`, `intensity` (select 1–5), `location?`, `notes?`. The other
`journal_entries` columns (`durationSeconds`,`recoverySeconds`,`peoplePresent`,
`ownerResponse`) are left null this sub-project (explicitly out of MVP). New
shared `journalEntrySchema`. Owner-scoped API
`GET/POST/DELETE /api/dogs/:id/journal[/:entryId]` (same `findOwnedDog` guard;
404 not 403).

**Behavior Brief (`/app/brief` and `/app/dogs/:id/brief`)** — `/app/brief` is a
dog selector that routes to `/app/dogs/:id/brief`. Per dog:
- `POST /api/dogs/:id/brief` (owner-scoped): server **deterministically**
  composes a plain-text summary (NO AI / NO external calls) from the dog's
  profile + concerns (with severity) + goals + journal entries (count, the
  last 5 ABC lines, average intensity); inserts a new `briefs` row with
  `version = max(existing)+1`, `status='draft'`.
- `GET /api/dogs/:id/brief` → the latest brief (highest version) or null.
- `PUT /api/dogs/:id/brief` → set the latest brief `status='finalized'`.
- UI: readable summary view; **Generate/Regenerate**; **Mark finalized**;
  **Print** (`window.print()` + a print stylesheet) and **Copy to clipboard**.
  Shared schema for the response shape as needed.

**Trainers (`/app/trainers`, `/app/trainers/:id`)** — directory, behind
`requireUser` but **not** owner-scoped (shared catalog). `GET /api/trainers`
with optional query filters `specialty`, `methodology`, `state` (filter on the
array/text columns); `GET /api/trainers/:id`. UI: filter controls + result
list + detail (name, business, city/state, methodology/certs/specialties,
website/email/phone). The table is empty in prod → ships with a friendly empty
state. **Seeding/admin management of trainers is out of scope** (future).

**Profile (`/app/profile`)** — `GET /api/profile` → `{id,name,email}` for the
session user (read from `user` by `session.user.id`); `PUT /api/profile`
`{name}` updates `user.name` for the session user only. Email is displayed
**read-only** (email change = a verification flow, out of scope). zod
`profileUpdateSchema = { name: z.string().min(1) }`.

**Settings (`/app/settings`)** — language preference (reuses the existing i18n
`setLocale` + its `localStorage` persistence; no backend); plus a small account
block: a Sign-out button and a link to Profile. Delete-account /
change-password are **out of scope** (tracked by the separate account-recovery
follow-up).

### Cross-cutting

- **i18n**: every new user-facing string via `t()`, added to BOTH `en` and `es`
  (compile-time `Messages` parity + the runtime parity/no-untranslated tests).
  New catalog sections: `shell` (nav item labels, banner aria, signOut reuse),
  `overview`, `journal`, `brief`, `trainers`, `profile`, `settings`. Enum/option
  labels (intensity, brief status, trainer filters) localized; stored values
  stay canonical. Agent writes idiomatic Spanish per the established glossary.
- **API**: all new sub-routers chained/mounted so `AppType` infers for the
  typed `hc` client; owner-scoped (`requireUser` + `findOwnedDog`) for
  journal/brief/overview/profile; `trainers` behind `requireUser` only. 401
  unauth, 404 not-found/not-owned (no existence leak), 400 zod.
- **Tests**: shared schema units (journal, profile); api owner-isolation tests
  for journal + brief (cross-user → 404) and the trainers filter + profile
  update; overview aggregate; web render tests for `AppShell` (rail items,
  active state, **Admin hidden for non-admin / shown for admin**, responsive
  drawer toggling), `BrandMark`, and each new screen (loading/empty/populated);
  existing suites stay green; `landing.test` stays green after `site-nav` is
  refactored to `<BrandMark/>` (wordmark text unchanged, assertions unaffected).
- **Gates** (per task + final): `pnpm -r exec tsc --noEmit`, `pnpm -r test`
  (twice — api integration idempotent), `pnpm -r build`, `pnpm lint` — all
  green. No `package.json`/`pnpm-lock.yaml`/`apps/api` infra/schema/migration
  change.

## Error handling

Server: 401 unauthenticated; 404 not-found or not-owned; 400 zod; generic
localized error toast on 5xx (server message preferred, mirroring the
auth-route pattern). Client: TanStack Query `isError` → localized inline
message/toast; mutations invalidate the right query keys (e.g. journal
mutations invalidate `["journal",dogId]` and `["overview"]`; brief mutations
invalidate `["brief",dogId]` + `["overview"]`). Print/copy are
browser-native; copy failure → toast.

## Out of scope / unchanged

PDF export of the Brief (MVP = print + copy); AI/LLM brief generation
(deterministic template only, no external calls); journal fields beyond the
MVP set; trainers seeding/admin CRUD; email change; delete-account /
change-password; theming/dark-mode; moving `/admin` inside the shell; any DB
schema/migration; any new runtime dependency; the marketing site content
(only `site-nav` is refactored to use `<BrandMark/>`, no visual change).

## Flagged decisions (reasonable; reviewable)

1. **One mega-PR** — the user explicitly chose this over decomposition after
   two warnings; mitigated by many small reviewed TDD tasks internally.
2. Brief export = print + copy now; **PDF is a future follow-up**.
3. Brief generation is a **deterministic server-side text template** (no AI),
   so it's testable and dependency-free.
4. Trainers ships **empty** (friendly empty state); no seed/admin this PR.
5. Journal is **top-level with a dog selector** (not buried per-dog); MVP form
   omits the four advanced `journal_entries` columns.
6. Profile email **read-only**; Settings **minimal** (language + sign-out/link).
7. `/admin` stays outside the shell; only a rail **link** for admins.
8. Brand mark extracted to a shared component; `site-nav` refactored to it
   (no visual change; `landing.test` must stay green).
