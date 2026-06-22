# Spec: Turing — "Quiet Turing" hide setting — phase 2e

**Date:** 2026-06-21
**Branch:** `worktree-feat+turing-quiet-setting` (off `main` @ `765d806`)
**Status:** Design — approved (direction); pending spec review
**Predecessor:** phase 2d celebration bubbles (PR #56, merged)

## Why

Turing is a persistent, animated, fixed-position element with **no way to turn him off**.
Some users find a moving mascot distracting; a companion with no off-switch is a real product
gap. This adds a simple **Show/Hide** toggle in Settings.

## Owner decision (confirmed)

- **Hide completely** (not a "calm" middle state): when off, Turing is not rendered at all.

## Design

### A. Provider preference (`turing-context.tsx`)
- Add `hidden: boolean` + `setHidden: (v: boolean) => void` to the context (and the
  `useTuring()` no-op fallback: `hidden: false`, `setHidden: () => {}`).
- Persist per-device in `localStorage` under `tc-turing-hidden` (consistent with the app's
  other client prefs — nav-expanded, locale, onboarding-dismiss). Default **shown** (`false`),
  preserving current behavior. Initialize state from a guarded `localStorage` read.
- When `hidden`, **skip the idle/activity listeners** (the activity `useEffect` early-returns
  when hidden, so no pointermove/keydown listeners or idle timer run while he's off).

### B. Component (`turing-companion.tsx`)
- Consume `hidden` from `useTuring()`. **Return `null` when `hidden`** (placed after all hook
  calls — Rules of Hooks). Also short-circuit the ambient effects (`if (reduceMotion ||
  hidden) return;` in the eye-follow + blink effects) so nothing runs while hidden.

### C. Settings toggle (`routes/settings.tsx`)
- A new "Companion" `<section>` with an accessible labeled checkbox bound to
  `hidden`/`setHidden` from `useTuring()`. Checked = shown. Settings renders inside
  `TuringProvider` (it's under `AppShell`'s Outlet), so the toggle drives the live mascot.
- No Switch component exists; use a native `<input type="checkbox">` + `<label>` (accessible,
  no new dependency).

### D. i18n (`turing`/`settings` section, en + es, parity-enforced)
| key | en | es |
|---|---|---|
| settings.companion | Companion | Compañero |
| settings.showTuring | Show Turing | Mostrar a Turing |
| settings.showTuringHint | Your training companion in the corner | Tu compañero de entrenamiento en la esquina |

## Notes / non-goals

- Mutation hooks still call `celebrate()` when hidden — harmless (nothing renders; with idle
  listeners off it's effectively inert). No need to gate the hooks.
- **Per-device, not account-synced** (localStorage) — matches existing prefs; no API/DB change.
- No "calm" mode, no per-page auto-hide (possible future slices).

## Test plan (TDD)

- **context:** `hidden` defaults `false`; reads an existing `tc-turing-hidden=true` on init;
  `setHidden(true)` updates state + writes localStorage; no-op fallback returns `hidden:false`.
- **component:** with `useTuring` mocked `hidden:true`, `TuringCompanion` renders nothing
  (`queryByRole("button", {name:/turing/i})` is null); `hidden:false` renders as today.
- **settings:** the Companion toggle renders; toggling it calls `setHidden` with the right
  value (mock `useTuring`); existing `settings.test.tsx` stays green (wrap in `TuringProvider`
  if the new `useTuring()` call needs it — fallback means it won't crash regardless).
- i18n parity (existing) covers the new keys.

## Verification

- `pnpm test` green; `tsc` 0; **root** `pnpm biome check .` clean; build OK; react-doctor no
  new findings on changed files.
- Manual: Settings → uncheck "Show Turing" → he disappears immediately and stays gone on
  reload; re-check → he's back; EN/ES labels correct.
