# Spec: Turing companion mascot — phase 1

**Date:** 2026-06-20
**Branch:** `feat/turing-companion-mascot`
**Status:** Implemented (phase 1)
**Source:** Design handoff from Claude Design (`Turing the companion animation.zip` → `design_handoff_turing_companion/`)

## Background

Claude Design produced a high-fidelity design handoff for **Turing**, an animated
companion mascot for TuringCare (a blue-merle Mini American Shepherd). The handoff
ships as design-reference HTML (`.dc.html` + a `support.js` preview runtime) plus a
detailed `README.md` with artwork, colors, markings, animation timings, and behaviors.

The handoff's README assumed a static site and suggested a vanilla web component or
iframe. Our actual web app is **React 19 + Vite + react-router 7 + Tailwind v4**
(`apps/web`), so we port natively: a single self-contained React component. No iframe,
no `support.js`, no new dependencies.

## Decisions (confirmed with owner)

- **Scope:** Authenticated app only — mounted inside `AppShell` (`/my/*`). Acts as an
  in-app training guide rather than a marketing element. Keeps public/auth pages clean.
- **Variant:** Corner widget — ambient (breathe/blink/tail-sway) + eye-follow + hover
  head-tilt + tap-for-tip. The fuller 8-pose, event-driven variant is deferred to phase 2.

## Scope (phase 1)

In scope:
- `TuringCompanion` React component: inline SVG artwork (copied verbatim from
  `Turing Corner.dc.html`, owner-approved markings) + ported vanilla logic as React state.
- Behaviors: breathing loop, random blink loop (2.4–5.6s, 130ms close), tail sway,
  eye-follow (pointer), hover head-tilt + ear rotation, click → random training tip in a
  speech bubble for 3.6s.
- Accessibility: rendered as a `<button>` with an aria-label; honors
  `prefers-reduced-motion: reduce` (disables breathe/sway/blink loops).
- Mounted once in `AppShell` so it persists across `/my/*` route changes.
- Keyframes added to `index.css` following the existing `tc-drift` + reduced-motion pattern.
- Unit tests (vitest + testing-library) following the `BrandMark` convention.

Out of scope (phase 2+):
- The 8-pose `state`-driven variant (`celebrate`/`sleep`/`wag`/…) wired to journal /
  training / week completion events.
- i18n of the 6 training tips (English-only for phase 1; flagged as a follow-up).
- Mobile reposition/hide tuning beyond the responsive `clamp()` sizing from the handoff.

## Implementation notes

- **Artwork:** one `<svg viewBox="0 0 240 270">`, grouped per-motion (body→breathe,
  nested tail→sway/wag, head→tilt holding eyes/ears/muzzle; pupils own group for
  cursor-translate; eyelids are ellipses whose `ry` animates 0→21px for blink).
- **Logic → React:** `useState` for `{ mode, bubble, pupil, blink }`; `useEffect` for the
  `mousemove` listener + self-rescheduling blink timer (cleaned up on unmount).
- **Placement:** `position: fixed; right:14px; bottom:8px; z-index` below the sonner
  Toaster so toasts/nav drawer stay clickable; `width: clamp(96px,24vw,138px)`.
- **Reduced motion:** reuse the repo's `matchMedia("(prefers-reduced-motion: reduce)")`
  check (as in `hooks/use-in-view.ts`); skip ambient loops + eye-follow when set.

## Design tokens / copy

Colors and the 6 exact tip strings are carried from the handoff README (coat `#9aa7b2`,
merle `#232830`, eye blue `#5fa0c6` / amber `#a8763c`, tag teal `#2f8f9d`, outline
`#1c1916`). Tips: "Catch him being good — then reward it." / "Mark the moment, then
treat." / "Short sessions beat long ones." / "Reward what you want repeated." / "Calm
earns the treat, not the jump." / "End every session on a win."

## Test plan

- Renders an accessible control (button) with the tap aria-label.
- Clicking shows a training-tip bubble whose text is one of the 6 tips.
- Bubble hidden initially.
- Reduced-motion: ambient animation classes/loops are not applied when the media query matches.

## Verification

- `pnpm test` (apps/web) green, including new component tests.
- Manual: `pnpm dev`, sign in, confirm Turing in the corner of `/my/*`, breathing/blink,
  eyes follow cursor, hover tilt, tap shows a tip; not present on public/auth pages.
