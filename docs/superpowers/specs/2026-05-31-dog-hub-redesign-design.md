# Dog-hub redesign (hub + spokes) — design

**Date:** 2026-05-31
**Status:** Approved (design)

## Problem

The current `/my/dogs/:id` page packs in: dog header (name + actions + delete-
with-confirm), metadata card, concerns list + add form, goals list + add form
+ templates picker, and the full `ProgressPanel` (every goal → every skill →
session lists + 2 collapsible forms per skill). A dog with 3 goals × 4 skills
× a handful of sessions easily yields 50+ interactive elements on one page.
Even the person who built it had to ask where to find things — a real user
without that mental model is worse off.

Adjacent gaps the audit surfaced: journal lives at `/my/journal?dogId=...`
with no dog-scoped entry point on the dog page; `/my/brief` and
`/my/dogs/:id/brief` both exist (one with a picker); `/my/dogs` is a list
page that duplicates the dashboard's "Your dogs" cards.

## Goal

Restructure the dog experience as a **hub + spokes** with real URLs, give the
hub a single job ("at a glance, what's going on with this dog?"), move
training + journal + brief to their own focused sub-routes, and reduce
training-spoke density by collapsing per-skill detail behind a click.

Non-goals: dog photos (separate feature; the hub leaves space for it but
doesn't implement upload); a redesigned brief UI (the brief spoke renders
the existing `<Brief />` component verbatim under the new layout); the
cross-pet `/my/journal` and `/my/brief` routes (they stay as power-user
views).

## Information architecture

Routes under `/my/dogs/:id/*`:

| Route | Page | Status |
|-------|------|--------|
| `/my/dogs/:id` | Hub (overview) | rewritten |
| `/my/dogs/:id/journal` | Journal spoke (dog-scoped) | new |
| `/my/dogs/:id/training` | Training spoke (goals + skills + sessions) | new (moved from hub) |
| `/my/dogs/:id/brief` | Brief spoke | exists; wrapped by new layout |
| `/my/dogs/:id/edit` | Profile-edit form | unchanged |

All four child routes share a `<DogLayout>` outlet wrapper that renders:

1. A sticky **dog banner** at the top — name + breed · size · age · weight —
   so every spoke confirms "you're working on Biscuit." Right-aligned `[Edit]`
   button and `[⋯]` kebab (Delete with confirmation modal).
2. A horizontal **tab strip** [ Overview · Journal · Training · Brief ]
   using real `<Link>` elements — URL changes, browser back/forward works,
   deep linking works. The hub IS the "Overview" tab. ("Overview" is the
   user-facing label; "hub" is an internal codename used in this spec —
   it does not appear in the UI.)

Deprecated:

- **`/my/dogs`** (standalone dogs list) — redirects to `/my`. The dashboard's
  "Your dogs" cards are the canonical entry point.

Kept (unchanged):

- **`/my/journal`** — cross-pet journal with dog filter.
- **`/my/brief`** — cross-pet brief view with dog picker.
- **`/my/dogs/new`** — create-dog form (no dog id yet, so no layout wrapping).

## The hub (`/my/dogs/:id`)

Single, scannable overview rendered inside `<DogLayout>` (banner + tab strip
above):

1. **Three spoke cards** in a responsive grid (3 columns desktop, 1 column
   mobile). Each card is a `<Link>` to its spoke with an at-a-glance metric:
   - **Journal** — `{N} entries · last {ago}` (or `"No entries yet — log
     your first"` if empty).
   - **Training** — `{N} goals · {M} skills · avg confidence {X}/5` (or
     `"No goals yet"` if empty).
   - **Brief** — latest version + status ("Draft v2") + last-generated
     ago; or `"No brief yet"`.
2. **Concerns** block — read-list with severity badges and the existing
   inline `add / remove` controls. Concerns describe the dog, not training,
   so they stay on the hub.
3. **Recent activity** — top 3 journal entries (one line each:
   `"{behavior or note} · {date}"`), with a `"See all in Journal →"` link
   routing to the journal spoke.
4. **Primary quick action**: a prominent `[ + Log a moment ]` button below
   the spoke cards. Routes to `/my/dogs/:id/journal?compose=moment` — the
   journal spoke reads that query param and auto-focuses the quick-moment
   composer.

The hub renders **nothing** that belongs in a spoke: no goals editor, no
skill management, no progress panel mount.

## Training spoke (`/my/dogs/:id/training`)

Reuses today's `<ProgressPanel>` content but restructured for density.

**Top of page:**
- The existing goal-add row (free-text input + `Add Goal` button + the
  `Templates ▼` picker from PR #39). Unchanged.

**Per-goal section** (one per `trainingGoals` row):
- Goal name (`<h2>`) + average-confidence chip on the right.
- Add-skill button (existing UX) at the bottom of the goal's skills list.

**Per-skill row (collapsed — default):** one always-visible row showing:
```
▼ Sit · L3 (3/5)                          5 sessions · 3d ago
   Dog reliably sits on cue
   Level 3 — Sits on cue with one mild distraction present
```
- Chevron toggle on the far left.
- Skill name + confidence chip (current confidence + readable label like
  "L3 (3/5)").
- Right side: session count + last-session-ago.
- Two thin subtitle lines: catalog `description` (if `catalogSkillKey`
  matches) and current-level milestone (if applicable).
- Nothing else rendered when collapsed — no buttons, no forms, no session
  list.

**Per-skill row (expanded — after chevron click):**
- Same header line as collapsed (chevron now `▲`).
- Last note (one line) if any.
- Action row: `[Log session] [Edit] [Remove skill]`.
- Recent sessions list (top 5, same as today).
- The existing edit + log-session inline forms appear here when their
  buttons are clicked (existing behaviour, just nested inside the expanded
  row).

State note: expand/collapse state is per-row and component-local; not
URL-persisted, not localStorage-persisted. Refreshing the page collapses
all skills (acceptable — the always-visible row already carries the gist).

A user with 3 goals × 4 skills sees 12 compact rows by default. Expanding
one keeps the others compact.

## Journal spoke (`/my/dogs/:id/journal`)

Renders the same composers and entry list as the existing `/my/journal`,
but with three differences:

1. The dog-filter UI is removed (the route already scopes to this dog).
2. Composer `selectedDogId` is forced to the route's `:id` (no picker
   needed; no chance of logging against the wrong dog).
3. The composer can auto-open if `?compose=moment` (or `?compose=daily`) is
   present on the URL — used by the hub's `[ + Log a moment ]` quick action.

Implementation note: the journal route's existing component largely already
supports a `dogId` mode (it reads `?dogId=` query). We extract a shared
inner component (`<JournalView dogId={...} composeMode={...}>`) and have the
cross-pet `/my/journal` and the new `/my/dogs/:id/journal` both render it
with different scoping arguments.

## Brief spoke (`/my/dogs/:id/brief`)

Already exists; renders `<Brief />` from `apps/web/src/routes/brief.tsx`
with the dog id from `useParams`. No content change. The only new thing is
that it now sits inside `<DogLayout>`, so the dog banner + tab strip
appear above its existing UI.

## Components — new and changed

**New:**
- `apps/web/src/components/dog-layout.tsx` — the shared outlet wrapper.
  Renders the sticky banner + tab strip + `<Outlet />`. Reads the dog from
  `useDog(id)` and shows a loading skeleton while it resolves.
- `apps/web/src/components/dog-hub/spoke-card.tsx` — small presentational
  card (icon, title, primary stat line, secondary stat line, optional empty
  message), takes a `to` prop. Used three times on the hub.
- `apps/web/src/components/dog-hub/recent-activity.tsx` — small read-only
  list of the dog's top-3 entries; takes the entries + an `onSeeAll` href.

**Heavily revised:**
- `apps/web/src/routes/dog-detail.tsx` — rewritten as the hub (header +
  three spoke cards + concerns + recent activity + Log a Moment CTA). The
  goal/skill/progress sections are removed; concerns inline add/remove is
  kept.
- `apps/web/src/components/progress/progress-panel.tsx` — the `<SkillCard>`
  internals are refactored to a collapsed/expanded pattern. The component's
  public API (props) is unchanged so it can be mounted from the new
  training spoke without further changes elsewhere.

**New routes (files):**
- `apps/web/src/routes/dog-journal.tsx` — thin wrapper that reads
  `:id` from params + `?compose=` and renders `<JournalView dogId={id}
  composeMode={...} />`.
- `apps/web/src/routes/dog-training.tsx` — thin wrapper that mounts
  `<ProgressPanel dogId={id} />` plus the goal-add row (input + Add Goal +
  `<TemplatePicker dogId={id} />`).

**Refactored (no behaviour change):**
- `apps/web/src/routes/journal.tsx` — split into the existing route +
  an internal `<JournalView>` component that both routes consume.

## Routing — `main.tsx` changes

Replace:
```ts
{ path: "/my/dogs/:id", element: <DogDetail /> },
{ path: "/my/dogs/:id/edit", element: <DogForm mode="edit" /> },
{ path: "/my/dogs/:id/brief", element: <Brief /> },
{ path: "/my/dogs", element: <DogsList /> },
```

with:
```ts
{ path: "/my/dogs/new", element: <DogForm mode="create" /> },
{
  path: "/my/dogs/:id",
  element: <DogLayout />,
  children: [
    { index: true, element: <DogHub /> },
    { path: "journal", element: <DogJournal /> },
    { path: "training", element: <DogTraining /> },
    { path: "brief", element: <Brief /> },
    { path: "edit", element: <DogForm mode="edit" /> },
  ],
},
{ path: "/my/dogs", element: <Navigate to="/my" replace /> },
```

(`DogHub` is the renamed export from `dog-detail.tsx`; the file is renamed
to `dog-hub.tsx` for clarity. Existing imports update.)

## i18n

New keys under a `dogHub` section (en + es) — UI chrome only:

- `tabOverview`, `tabJournal`, `tabTraining`, `tabBrief` — tab strip labels (`tabOverview` = "Overview" / "Resumen").
- `journalCard`, `trainingCard`, `briefCard` — card titles.
- `noEntries`, `noGoals`, `noBrief` — empty states.
- `journalMeta`, `trainingMeta`, `briefMeta` — short metric phrasings ("12
  entries", "3 goals · 8 skills · avg 3.2/5", "Draft v2 · 1w ago"). These
  can include simple `{n}` interpolations using the existing
  `formatMessage`-style pattern.
- `recentActivity`, `seeAllJournal`, `logAMoment` — section title, link
  label, primary CTA.
- `concernsTitle` — kept (already exists under `dogs`; the hub re-uses it).

Spanish values differ from English (i18n parity test enforces).

A few `dogs.*` keys are likely orphaned by this change (e.g. the
old goal-section-on-detail labels). Audit and remove as part of the PR,
following the precedent set by PR #38 (orphaned welcome-card keys).

## Tests

**Web (component + route):**
- `<DogLayout>` renders the banner + 4-tab strip + outlet; tab strip
  highlights the active spoke (uses `useMatch` or similar); each tab is a
  real `<Link>` whose href matches the spoke's URL.
- `/my/dogs/:id` (hub) renders three spoke cards with correct metric
  strings for: empty-state dog, dog with entries only, dog with everything;
  concerns add/remove still works; "Log a moment" CTA links to the journal
  spoke with `?compose=moment`.
- `/my/dogs/:id/training` mounts ProgressPanel with the dog's data; the
  goal-add row + templates picker render; per-skill rows start collapsed;
  chevron click expands one row without affecting others.
- `/my/dogs/:id/journal` renders the composer scoped to the dog; loading
  with `?compose=moment` auto-focuses the moment composer.
- `/my/dogs/:id/brief` still works (smoke test that the existing brief
  tests pass under the new layout wrapper).
- `/my/dogs` redirects to `/my`.

**No backend tests** — this is a pure web/IA change.

## Compatibility / no-change

- **No DB migration, no API change.** Same data, restructured presentation.
- The onboarding checklist's per-dog deep-links continue to work — they
  already route to `/my/dogs/:id`, which now lands on the hub with the
  Training card visible (so "Set a training goal" lands the user one click
  from the training spoke). The checklist's `mostRecentDogId` plumbing is
  unaffected.
- The training-catalog `TemplatePicker` works identically — it just
  renders on the training spoke now.
- Brief send + share + email flows: unchanged.
- The cross-pet `/my/journal` and `/my/brief` keep working for users with
  multiple dogs.

## Edge cases

- **Dog id not found** (deleted between requests): `<DogLayout>`'s
  `useDog(id)` returns `isError`; render a 404 message with a link back to
  `/my`. Children are not rendered.
- **No goals yet, no entries yet, no brief yet**: each spoke card shows a
  one-line empty state that still links into the spoke (where the user is
  guided to create the first thing).
- **Mobile**: the spoke cards stack vertically; the tab strip becomes a
  horizontally-scrollable row (no special hamburger needed at 4 items).
- **Tab strip on small spoke pages**: kept sticky at the top of the
  viewport so users can swap spokes from anywhere on a long page (training
  spoke can scroll long with many goals/skills).
- **Deep link from a bookmark to a deleted dog's spoke** (e.g.,
  `/my/dogs/abc/training`): the layout's error state catches it and offers
  the back-to-`/my` link.
