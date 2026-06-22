# Per-Dog Section (Dog Hub) Redesign — Design

**Date:** 2026-06-21
**Status:** Approved (design), pending spec review
**Scope:** De-bloat and unify the per-dog hub. Now that `/my/dogs` has rich expandable cards, the hub's **Overview tab is redundant** and several screens feel bloated. Drop Overview, tighten Training and Brief, and move Overview's remaining duties (Log a moment, Daily check-in, concerns) onto the dog card.

## Problem (from QA)

- The 5-tab hub "feels bloated and like the same section." **Overview** duplicates the new dog card (same Journal/Training/Brief metrics, recent activity, Log-a-moment, concerns).
- **Training** is the worst: "Agility training" appears 3× across nested boxes — a top goals list, a separate "Training progress / Confidence 1‑5" panel re-listing the same goal, and an auto-created skill named after the goal.
- **Brief** repeats "Behavior Brief" three times (page heading, card header, summary's first line) and reads as a plain-text wall.
- Card "Log moment" **navigates** to the journal page instead of opening a dialog; there's no Daily check-in on the card.
- The hub's "← All dogs" link goes to **`/my`** (dashboard) instead of **`/my/dogs`**.

## Goals

- Cohesive per-dog section: compact header + clean tab strip, **tabs = Journal / Training / Brief / This Week** (no Overview). Landing tab = **Journal**.
- **Training** is one clean goal→skills hierarchy (no double-listing, no leftover labels, no goal-named auto-skill).
- **Brief** de-duplicated and readable.
- The dog card owns what Overview did: in-place **Log moment** + **Daily check-in** dialogs, and **concern** add/remove.
- Fix the "All dogs" → `/my/dogs` nav bug.

## Non-goals

- No change to Journal or This Week tab content (they already use the tile/grid patterns); they just render under the new shell.
- No dog photos. No change to the brief's generation windows or share/PDF flow.
- **Not** building fully styled, parsed "section blocks" for the brief document body (would need the brief to carry structured data) — see Brief scope below. Deferred.

## Decisions (from brainstorming)

1. **Drop the Overview tab.** Landing → Journal.
2. **Concerns** add/remove move into the **expanded dog card** (`DogCardBody`), which already shows concern chips.
3. Card **Log moment / Daily check-in** open dialogs **in place** (reuse the journal `Sheet` + composers); no navigation.
4. **Adding a goal no longer auto-creates a same-named skill** — a goal starts with zero skills; the user adds skills.
5. Brief: remove the page heading + the summary's redundant first line; tightened card; readable document (styled section labels deferred).

## Architecture

### Implementation sequencing (avoid regression windows)
Overview currently hosts concerns + Log-a-moment. Dropping it before the card owns those would leave a gap. So build in this order: **(A) card enrichment → (B) Brief + Training de-bloat → (C) drop Overview + shell**. Only remove Overview after the card has concerns + dialogs.

### A. Dog card enrichment (`apps/web/src/components/dogs/dog-card-body.tsx`)
- **In-place capture:** replace the "＋ Log moment" `<Link to=…/journal?compose=moment>` with two buttons — **Log moment** and **Daily check-in** — that open a `Sheet` (`@/components/ui/sheet`) hosting `QuickMomentComposer` / `DailyCheckInComposer` (from `@/components/journal/`). Pass `dogs={[{ id: dog.id, name: dog.name }]}`, `selectedDogId={dog.id}`, `onDogChange={() => {}}`, `autoFocus`, `onSaved={() => closeSheet()}`. Single-dog list → composers hide their dog picker. The composers' `useAddEntry` already invalidates `["journal"]`/`["overview"]`; also invalidate `["dogs-overview"]` on save so the card's glance refreshes.
- **Concerns add/remove:** below the concern chips, add a compact add row (text input + severity select + Add) using `useAddConcern(dog.id)`, and make each chip removable via `useRemoveConcern(dog.id)` (both already in `@/lib/dogs`; `behaviorConcernSchema` in shared). Concerns come from `useDog(dog.id)` (already used). Invalidate `["dogs", dog.id]` (existing) so chips refresh.
- Keep the other actions (Brief →, This Week →, Edit) as links into the hub tabs.

### B1. Brief tightening (`apps/web/src/routes/brief.tsx`, `apps/api/src/lib/brief.ts`)
- Remove the page-level `<h1>Behavior Brief</h1>` (the tab + branded card already say it).
- In `composeBrief`, drop the redundant first line `Behavior Brief — {name}` (the card header shows the dog name + "BEHAVIOR BRIEF").
- Layout: **Period** chips + **Share ▸** + **Regenerate** on one compact row; below, the branded document card (header `TuringCare · BEHAVIOR BRIEF`, dog name + status pill, the summary as clean `whitespace-pre-wrap` text, "Generated {date}"). Keep Share sheet + Regenerate behavior unchanged.
- The summary text already contains `Concerns:` / `Goals:` / `Journal:` headers — they read cleanly in the tightened card. **Styled section blocks are out of scope** (deferred; would require structured brief data).

### B2. Training tab de-bloat (`apps/web/src/routes/dog-training.tsx`, `apps/web/src/components/progress/progress-panel.tsx`, `apps/api/src/routes/dogs.ts`)
- **Single hierarchy.** `dog-training.tsx` no longer renders a separate top "Training goals" list + add-goal/templates ABOVE a progress panel. Instead: a tidy **toolbar** (heading "Goals & skills" + **Templates** + **＋ Add goal**), then the goal cards.
- `progress-panel.tsx` becomes the goal→skills list (no "Training progress / Confidence 1‑5" wrapper header). Each **goal card**: name + avg-level badge + **Remove** (moved here from the old top list); its **skills** listed once (the existing `SkillCard` rows with the milestone stepper on expand); **＋ Add skill**. Add-goal/Templates handled by the toolbar (reusing the existing `useAddGoal` / `from-template` flows + `TemplatePicker`).
- **Stop auto-creating a goal-named skill:** `POST /:id/goals` currently inserts a `trainingSkills` row named after the goal. Remove that insert — return just `{ goal }`. A new goal renders with zero skills + an "Add skill" prompt. (Brief/progress/weekly-focus already tolerate zero-skill goals — avg shows none.) Update the affected API + web call sites/tests (`useAddGoal` returns `{ goal }`; the goal `from-template` path still creates its template skills, unchanged).

### C. Hub shell + drop Overview (`apps/web/src/components/dog-layout.tsx`, `apps/web/src/main.tsx`, delete `apps/web/src/routes/dog-hub.tsx`)
- `dog-layout.tsx`: tabs array drops the Overview entry → `[Journal, Training, Brief, This Week]`. Fix **both** "All dogs" links from `to="/my"` → `to="/my/dogs"`. Tidy the header/tab-strip styling to the cohesive look (underlined active tab, compact banner).
- `main.tsx`: the `/my/dogs/:id` index route no longer renders `<DogHub/>`; instead the index **redirects to `journal`** (`<Route index element={<Navigate to="journal" replace />} />`), so visiting a dog lands on the Journal tab.
- **Delete `apps/web/src/routes/dog-hub.tsx`** (the Overview component) and its imports/test — its metrics/recent-activity live on the card; concerns moved to the card (A). Remove the now-unused `SpokeCard`/`RecentActivity`/dog-hub components only if nothing else imports them (grep first).

### Data flow
No new endpoints. Reuses `useAddEntry` (journal), `useAddConcern`/`useRemoveConcern`/`useDog`, `useProgress`/`useAddGoal`/`useAddSkill`/`useSetSkillLevel`, `useBrief`/`useGenerateBrief`. The only API change is `POST /:id/goals` no longer creating a default skill. Card save invalidates `["dogs-overview"]` so glance lines stay fresh.

## Components / files
- Modify: `apps/web/src/components/dogs/dog-card-body.tsx` (+ test) — dialogs + concerns.
- Modify: `apps/web/src/routes/brief.tsx`; `apps/api/src/lib/brief.ts` (+ brief test expectations).
- Modify: `apps/web/src/routes/dog-training.tsx`, `apps/web/src/components/progress/progress-panel.tsx` (+ tests).
- Modify: `apps/api/src/routes/dogs.ts` (POST /goals) + `apps/api/src/routes/dogs.test.ts` (the "adds a goal" test no longer expects a skill).
- Modify: `apps/web/src/components/dog-layout.tsx`; `apps/web/src/main.tsx`.
- Delete: `apps/web/src/routes/dog-hub.tsx` (+ its test) once unreferenced.
- i18n: new keys for the card concern form + Daily-check-in action + Training toolbar ("Goals & skills", "Add goal", etc.) in `en.ts`/`es.ts`, parity-safe; reuse existing where they fit (`dogs.concernPlaceholder`, `dogs.severity*`, `dogs.addConcern`, `dogs.remove`, `journal.logMoment`, `journal.dailyCheckIn`, `progress.*`).

## Responsive / accessibility
- Mobile-first; the tab strip scrolls horizontally on narrow widths (already does). Tabs are real `<NavLink>`s with `aria-current`. Card dialogs use the existing `Sheet` (Esc/backdrop close, labelled). Concern remove buttons get accessible names. Tap targets ≥ 44px.

## Testing
- **Card:** Log moment / Daily check-in buttons open their sheets (not navigate); saving closes + invalidates; concern add (calls `useAddConcern`) and chip remove (calls `useRemoveConcern`) wired.
- **Training:** one goal card per goal with Remove; skills listed once; toolbar Add goal / Templates; no "Confidence 1‑5" header; a freshly-added goal shows zero skills + Add skill.
- **API:** `POST /:id/goals` returns `{ goal }` and creates **no** skill (progress shows the goal with empty skills); `from-template` still creates skills.
- **Brief:** page heading gone; `composeBrief` omits the redundant first line; document + Share/Regenerate render.
- **Shell:** tabs list excludes Overview; "All dogs" → `/my/dogs`; `/my/dogs/:id` redirects to `…/journal`; no dangling `dog-hub` import.
- Gates: shared/api/web tsc 0, web + api suites green, i18n parity green, biome 0, web build OK, react-doctor no new errors.

## Out of scope / follow-ups
- Styled, parsed brief section blocks (needs structured brief data).
- The global `/my/journal` & `/my/brief` dog-picker dropdowns (still there; cards route around them).
- Dog photos.
