# Expandable Dog Cards (`/my/dogs`) — Design

**Date:** 2026-06-21
**Status:** Approved (design), pending spec review
**Scope:** Redesign the `/my/dogs` list into expandable dog cards: a collapsed card shows a glance of status; tapping it expands inline to a rich, actionable summary (training goals with levels, recent activity, brief status, concerns) plus links into the existing per-dog hub.

## Problem

The `/my/dogs` view today is a plain list of `name · breed` links (`apps/web/src/routes/dogs-list.tsx`); clicking a dog leaves the page for a separate tabbed hub. That "extra hop" feels indirect, and there's nothing useful to scan on the list itself. (The dog-picker **dropdown** the user dislikes actually lives on the global `/my/journal` and `/my/brief` pages — out of scope here, but the new cards route around it by linking to dog-scoped views.)

## Goals

- Replace the flat list with **expandable cards** — one per dog.
- **Collapsed:** avatar (name initial) + `name · breed` + a one-line **glance** of status, so you can scan without expanding.
- **Expanded (inline):** a rich summary — a 3-stat strip, training goals with skill **level badges** (the milestone work), recent journal activity, behavior concerns — plus an action row and labeled links into the hub.
- Remove the "what happens when I click a dog?" ambiguity: the card header **toggles expand**; navigation happens only via explicit labeled links/buttons.

## Non-goals

- Not removing the per-dog **hub** (Overview/Journal/Training/Brief/This Week tabs) — the cards link into it for deep work.
- Not touching the global `/my/journal` and `/my/brief` dropdowns (separate cleanup).
- No dog **photos** (no photo field exists; avatar is the name initial — photos are a separate backlog item).
- No fully-inline journal compose / brief generation / This Week grid (those stay in the hub).

## Decisions (from brainstorming)

1. **Rich summary + links into the hub** (not a full hub replacement).
2. Collapsed cards show a **glance line** (the approved mockup includes it), which needs per-dog summary metrics for *every* dog → a small batched summary endpoint (below) to avoid N+1.
3. **Multi-expand** — cards toggle independently; no URL persistence of expand state.
4. Expanded **detail is lazy-loaded** (only when a card opens), reusing existing per-dog hooks.

## Architecture

### Backend — batched dogs overview

New endpoint so the list renders the glance line in **one** request instead of N+1.

- `GET /api/dogs/overview` → `{ dogs: DogOverview[] }`, owner-scoped, ordered like the existing list. **Register `.get("/overview", …)` BEFORE the existing `.get("/:id", …)` in the Hono chain** — otherwise `/overview` is captured as `:id = "overview"`.
- New lib `apps/api/src/lib/dogs-overview.ts` → `loadDogsOverview(ownerId)`:
  - Loads the owner's dogs, then computes per-dog aggregates with grouped queries (no per-dog loop):
    - **journal:** `count(journal_entries)` + `max(occurred_at)` grouped by `dog_id`.
    - **training:** `count(distinct training_goals)`, `count(training_skills)`, `avg(training_skills.confidence)` joined `goals→skills` grouped by `dog_id`.
    - **brief:** latest `briefs` row per dog → `status`, `version` (use `max(version)` / latest by `generated_at`).
  - Returns `DogOverview = { id, name, breed, ...base dog fields, summary: { journalCount, lastActivityAt: string|null, goalCount, skillCount, avgLevel: number|null, briefStatus: "draft"|"finalized"|null, briefVersion: number|null } }`.
- The `DogOverview` / `DogSummary` response shape is typed in **`apps/api/src/lib/dogs-overview.ts`** (the source of truth) and **mirrored web-local in `apps/web/src/lib/dogs.ts`** — the same pattern `ProgressSkill` uses across the api/web boundary. No `packages/shared` change needed.
- The existing `GET /dogs` (minimal list, used by dropdowns/selectors) is **unchanged**.

### Frontend — the cards

- `apps/web/src/lib/dogs.ts`: add `useDogsOverview()` → `GET /dogs/overview`, queryKey `["dogs-overview"]`.
- Rewrite `apps/web/src/routes/dogs-list.tsx`:
  - Title "Your dogs"; loading/error/empty states preserved (empty → CTA to `/my/dogs/new`); a trailing dashed **＋ Add a dog** button.
  - Render a `<DogCard>` per dog from `useDogsOverview()`.
- New `apps/web/src/components/dogs/dog-card.tsx` (`DogCard`):
  - **Header (always shown):** avatar = name initial in a dark circle; `name · breed`; **glance line** built from `summary` (e.g. `5 skills · avg 3/5 · 12 entries` + a brief pill `Draft v2` / `No brief yet`); a chevron. The whole header is a `<button>` that toggles `expanded`.
  - **Body (when expanded):** lazy-loaded — only mounts its data hooks when open.
    - **Stat strip:** 3 mini-stats (journal count + last activity ago, avg level + skill count, brief status + version) — from `summary` (already loaded, no extra fetch).
    - **Training:** goals each with their skills as `name Ln` level badges — from `useProgress(dogId)` (enabled on expand). Header link "Open Training →" → `/my/dogs/:id/training`.
    - **Recent activity:** last 2 journal entries (note + humanized time) — from `useJournal(dogId)` (enabled on expand), sliced to 2. Link "Journal →" → `/my/dogs/:id/journal`.
    - **Concerns:** chips — from `useDog(dogId)` (returns `concerns`), enabled on expand.
    - **Action row:** `＋ Log moment` → `/my/dogs/:id/journal?compose=moment`; `Brief →` → `/my/dogs/:id/brief`; `This Week →` → `/my/dogs/:id/week`; `Edit` → `/my/dogs/:id/edit`.
  - Each expanded section shows its own loading/empty fallback (e.g. "No goals yet").
- Reuse existing humanized helpers: `dateLabel`/`humanTime` from `@/lib/when` (timeline), and the time-ago formatting pattern from the dog-hub overview for "last activity".

### Data flow

Collapsed glance = `useDogsOverview()` (one request, all dogs). Expanding a card lazily enables `useProgress(dogId)` + `useJournal(dogId)` + `useDog(dogId)` (3 requests, cached) for its detail. Actions/links navigate to existing routes; no new write paths. `["dogs-overview"]` is invalidated by mutations that change the summary (add/remove dog, add goal/skill, log session/journal, generate/finalize brief) — wire these invalidations into the relevant existing hooks.

## Components / files

- Create: `apps/api/src/lib/dogs-overview.ts`, `apps/api/src/lib/dogs-overview.test.ts`
- Modify: `apps/api/src/routes/dogs.ts` (add a static `.get("/overview", …)` route, placed before `.get("/:id", …)`), `apps/api/src/routes/dogs.test.ts`
- Shared: add `DogOverview`/`DogSummary` types (`packages/shared/src/dog.ts` or web-local mirror)
- Create: `apps/web/src/components/dogs/dog-card.tsx`, `apps/web/src/components/dogs/dog-card.test.tsx`
- Modify: `apps/web/src/routes/dogs-list.tsx` (+ its test), `apps/web/src/lib/dogs.ts` (add `useDogsOverview`; add `["dogs-overview"]` invalidation to dog/goal/skill/journal/brief mutations)
- i18n: new keys in `apps/web/src/i18n/en.ts` + `es.ts` (card glance/section headings/actions), parity-safe. Reuse existing `dogs.*` and `dogHub.*` strings where they fit (e.g. tab labels, metric formats, time-ago).

## Responsive / accessibility

- Mobile-first; cards full-width, single column.
- Header toggle is a real `<button aria-expanded>`; the chevron is decorative (`aria-hidden`). Level badges and links have accessible text. Tap targets ≥ 44px.
- Expanded body is keyboard-reachable; links are real `<Link>`s (right-click/open-in-new works).

## Testing

- **API:** `loadDogsOverview` returns correct per-dog aggregates (journal count + last activity, goal/skill counts, avg level, brief status/version); zero-state dog (no goals/journal/brief) returns nulls/zeros; owner scoping (no other owner's dogs). `GET /dogs/overview` 200 shape; unauth/cross-owner behavior. (CI Postgres.)
- **Web:** `DogCard` collapsed shows the glance from `summary`; clicking the header expands and renders training goals with level badges, recent activity, concerns (mock the lazy hooks); action links point at the right routes; empty sections show fallbacks. `dogs-list` renders one card per dog + empty state + add button. i18n parity green; web tsc + biome + build clean; api tsc + tests.

## Out of scope / follow-ups

- Dog profile photos (replace the initial avatar).
- Cleaning up / removing the global `/my/journal` and `/my/brief` dog-picker dropdowns now that cards link to dog-scoped views.
- Possibly retiring the hub's Overview tab if it becomes redundant with the expanded card (revisit later).
