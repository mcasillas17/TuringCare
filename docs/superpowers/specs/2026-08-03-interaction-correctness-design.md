# Interaction Correctness (UX/A11y Slice 1) — Design Spec

**Date:** 2026-08-03
**Status:** Approved (design)
**Source:** `docs/AUDIT-2026-08-01-production-readiness.md` — Workstream D+E, Slice 1.

## Goal

Make the app's interactive controls behave correctly and accessibly before an invited
beta. This slice targets the findings where UX bugs and accessibility gaps overlap: the
three hand-rolled floating menus, the mobile navigation drawer, destructive actions that
fire without confirmation or error feedback, silent inline-add failures, and three
Behavior Brief control bugs. It fixes genuinely broken behavior (menus that never
dismiss, deletes that silently lose data), not cosmetics.

Explicitly **not** in this slice: Slice 2 (mobile layout, loading skeletons, landing nav,
courses table, tappable trainer contact, localized dates) and Slice 3 (form labels,
contrast tokens, `<html lang>`, missing `h1`s). Those are separate specs.

## Background / current state

- The app uses the unified **`radix-ui`** package (v1.4.3). Only `LanguageToggle`,
  `ui/accordion.tsx`, `ui/button.tsx`, `ui/label.tsx`, and `ui/form.tsx` use Radix today.
  There are **no** Dialog/Popover/DropdownMenu/AlertDialog primitives in `components/ui/`.
- Toasts are **Sonner** (`ui/sonner.tsx`), imported as `import { toast } from "sonner"`.
- The established destructive-confirm idiom is inline two-button + red warning text with
  `try/catch` + toast (`components/dog-layout.tsx:66-94`, dog delete).
- Three floating menus are hand-rolled with `useState(open)` + an absolutely-positioned
  element and **no** outside-click / Escape dismissal, focus management, or (in two cases)
  ARIA state:
  - `components/training/template-picker.tsx:69-93` (the `phase:"open"` `<ul>`)
  - `components/progress/confidence-chip.tsx:46-64` (the level menu)
  - `components/week/week-grid.tsx` (per-cell session detail popover)
- The mobile nav drawer (`components/app-shell/AppShell.tsx:126-136`) is a raw overlay:
  no focus trap, no Escape, no focus return, background not inert, hardcoded English
  `aria-label="Close menu"`.
- Several deletes fire on a bare `.mutate()` — no confirm, no pending state, silent on
  failure (the row just reappears on refetch).

## Design

### 1. Shared UI primitives (`components/ui/`)

Add four thin, brand-styled wrappers over `radix-ui`, following the `accordion.tsx` /
`LanguageToggle` convention (portal + brand classes: `border-silver`, `bg-surface`,
`text-slate`, `shadow-md`, `z-50`). No new dependency.

- `ui/dropdown-menu.tsx` — re-exports Root/Trigger/Portal/Content/Item styled for menus.
- `ui/popover.tsx` — Root/Trigger/Portal/Content for the week-grid cell detail.
- `ui/sheet.tsx` — built on Radix `Dialog`, a left/right slide-in panel (Overlay + Content
  + Close), for the mobile drawer. Props: `side` (default `"left"`), `open`, `onOpenChange`.
- `ui/alert-dialog.tsx` — Radix `AlertDialog` Root/Trigger/Portal/Overlay/Content/Title/
  Description/Cancel/Action, styled to match the app; the Action button accepts a
  `pending` prop for the in-flight state.

These become the reusable foundation Slices 2–3 also consume.

### 2. Menu migrations (finding D1)

Behavior parity + Radix's built-in outside-click, Escape, focus return, and ARIA state.

- **`template-picker.tsx`** — replace the `phase:"open"` `<ul>` with `DropdownMenu`
  (trigger = the existing "Templates" button; items = catalog templates). Selecting an
  item still transitions to the inline `preview` section (unchanged — a deliberate confirm
  gate). `closed`/`open`/`preview` phase model stays; only the `open` rendering changes.
- **`confidence-chip.tsx`** — replace the absolute `<div>` of 5 level buttons with
  `DropdownMenu`. Remove the manual `aria-haspopup`/`aria-expanded` and the
  `event.stopPropagation()` open toggle (Radix manages trigger state); keep
  `stopPropagation` on item selection only if needed to avoid card-expand side effects
  (verify against `SkillCard`).
- **`week-grid.tsx`** cell popover — replace with `Popover`. Keep the day's session list,
  remove-session, and "log another" actions. Gains dismissal + focus return; the
  count>0 toggle exposes `aria-expanded` via Radix.

### 3. Mobile drawer → `Sheet` (finding E4)

Replace the raw overlay drawer in `AppShell.tsx` with the `Sheet` primitive (`side="left"`).
Gains: focus trap, Escape-to-close, focus return to the hamburger trigger, inert/`aria-hidden`
background. The close control uses a **localized** label (new i18n key, replacing the
hardcoded `"Close menu"`). Nav-item click still closes the sheet. Desktop rail is unchanged.

### 4. Destructive actions — tiered (finding D2)

**Tier A — AlertDialog confirm** (heavy / cascading / hard-to-recreate). Each dialog names
what is lost; the Action button shows a pending state; failure → `toast.error`; success →
existing success toast where one exists.

| Action | Site | Cascade / rationale |
|---|---|---|
| Delete dog | `dog-layout.tsx:66-94` (migrate the inline confirm to AlertDialog) | whole dog + all data |
| Delete goal | `routes/dog-training.tsx` (`useRemoveGoal`) | cascades skills + sessions |
| Delete skill | `components/progress/progress-panel.tsx` (`useRemoveSkill`) | cascades sessions |
| Delete journal entry | `components/journal/entry-card.tsx` (`del.mutate`) | logged observation, hard to recreate |

**Tier B — no modal, correctness only** (light / easily redone): add a disabled-while-pending
state + an `onError` toast to the currently-bare mutations. No confirmation dialog.

| Action | Site |
|---|---|
| Remove concern chip | `routes/dog-hub.tsx` (`useRemoveConcern`) |
| Delete one practice session | `progress-panel.tsx` session list + `week-grid.tsx` popover (`useRemoveSession`) |

### 5. Inline adds (finding D2)

`Add goal` (`routes/dog-training.tsx`) and `Add concern` (`routes/dog-hub.tsx`): wrap the
`mutateAsync` in `try/catch` with an error toast, disable the submit while `isPending`, and
clear the input **only on success**. Prevents double-submit and silent field-clearing on
failure.

### 6. Behavior Brief control fixes (finding D3) — `routes/brief.tsx`

- **Generate success** (line 88): `toast.success(t("brief.title"))` → `toast.success(t("brief.generated"))`.
- **Finalize** (line 102): `<Button onClick={() => fin.mutate()}>` → an AlertDialog confirm
  ("Finalize locks this version"), with pending/disabled on the action and an `onError` toast.
- **Copy-summary failure** (line 127): the catch toasts `t("brief.genFailed")` → new
  `t("brief.copyFailed")` (the failure was a clipboard write, not generation).

### 7. i18n

New keys in **both** `en.ts` and `es.ts` (compile-time parity guard enforces equality of key
sets and es≠en values):

- Confirm-dialog copy for goal / skill / journal-entry deletes and brief finalize
  (title + body; reuse `dogs.deleteYes` / `dogs.deleteCancel` / `dogHub.deleteConfirm`
  for dog delete where they already fit).
- `nav.closeMenu` (drawer close label).
- `brief.generated`, `brief.copyFailed`.

### 8. Testing (TDD)

Write tests first (red → green). Per migration/behavior:

- **Menus:** open on trigger; close on Escape and on outside `pointerdown`; selecting an
  item fires the expected mutation and closes; trigger exposes Radix ARIA state.
- **AlertDialog deletes:** confirm → mutation called + success toast; cancel → mutation
  **not** called; a rejected mutation → `toast.error` and the item is not assumed gone.
- **Tier-B deletes / inline adds:** button disabled while pending; rejected mutation →
  `toast.error`; add clears field only on success.
- **Brief:** generate success uses `brief.generated`; finalize requires confirm; copy
  failure uses `brief.copyFailed`.
- **jsdom setup:** Radix needs the `ResizeObserver` + `hasPointerCapture`/`scrollIntoView`
  polyfills already established for the `LanguageToggle` popover test — extend the shared
  test setup rather than per-file shims.

### Non-goals

- No undo / soft-delete (rejected in favor of tiered confirm for this slice).
- No visual redesign of the menus beyond styling parity with the current look.
- No Slice 2 or Slice 3 items.

## Isolation & interfaces

- The four `ui/*` primitives have a single clear purpose each and are consumed only through
  their exported components — internals (Radix wiring, brand classes) can change without
  touching callers.
- Migrations are behavior-preserving at the data layer: no API, schema, or query changes.
  Existing route/component tests guard against regressions; new tests cover the added
  dismissal/confirm/error behavior.

## Rollout

Single worktree (`worktree-interaction-correctness`, off `main`) → PR. TDD, subagent-driven
execution. Gates: `pnpm biome check .` (root), `pnpm -r exec tsc --noEmit`, web + api +
shared tests, web build. Update `docs/PROJECT-LOG.md` on ship.
