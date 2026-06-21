# Spec: Turing companion — living, event-driven mascot — phase 2b

**Date:** 2026-06-21
**Branch:** `worktree-feat+turing-living-mascot` (off `main` @ `159cce9`)
**Status:** Design — pending user review
**Predecessors:** phase 1 (PR #46), phase 2a polish (PR #49)

## Goal

Make Turing feel attentive instead of decorative: he reacts to what the user
accomplishes (a happy hop / wag), dozes off when the app is idle, and offers tips
relevant to the page you're on. Driven by the 8-pose handoff variant (`Turing.dc.html`).

## Owner decisions (confirmed)

- **Idle → sleep** after ~60s of no activity.
- **Tiered celebrate:** a quick **wag** for frequent events (journal save, training
  session), the full **hop (`celebrate`)** for rarer ones (brief finalize / share / send).
- **Contextual tips:** tips bucketed by route (training/journal/week/brief/general), en+es.

## Architecture

Three units, each independently testable.

### 1. `TuringProvider` + `useTuring()` (`components/turing/turing-context.tsx`)
A small context mirroring `LocaleProvider`. Owns the *ambient* + *event* state that must
be reachable from anywhere in the app; the component's own pointer interactions stay local.

- State: `eventPose: "wag" | "celebrate" | null` (transient) and `asleep: boolean`.
- Imperative API exposed by `useTuring()`:
  - `celebrate(big?: boolean)` — sets `eventPose` to `"celebrate"` (big) or `"wag"` (small)
    for a fixed duration (`celebrate` ~2.6s, `wag` ~1.6s), then clears back to `null`. Also
    counts as activity (wakes from sleep, resets the idle timer).
- Idle tracking: a window listener on `pointermove`/`keydown`/`celebrate()` resets a 60s
  timer; on expiry `asleep = true`; any activity sets `asleep = false`. Disabled under
  `prefers-reduced-motion` (no auto-sleep loop churn) — he just stays idle.
- `useTuring()` returns a **no-op fallback** when no provider is mounted (so the component
  and its tests render bare), matching the `useI18n()` pattern.
- Mounted in `AppShell` wrapping the existing content + `<TuringCompanion/>`.

### 2. Pose-aware artwork (`turing-art.tsx` + `turing-head.tsx`)
Upgrade the phase-1 art to the 8-pose handoff visuals, driven by a single `pose` prop
(`"idle" | "tilt" | "bark" | "wag" | "celebrate" | "sleep"`). New pieces copied verbatim
from `Turing.dc.html` (owner-approved geometry):
- **Sleep:** closed-eye smile lines (the two `sleepLineStyle` paths) + floating **"zzz"**
  group (three `<text>` z's, `tg-zzz` animation) + slow breathe (5.8s) + head
  `rotate(9deg) translateY(7px)`; eyes closed (lids `ry:21`).
- **Celebrate:** the whole figure hops via a NEW outer **wrapper group** running
  `tg-hop .72s` + fast tail (`tg-wag-fast .3s`) + open mouth/tongue; body animation off.
- **Wag:** faster tail (`tg-wag .5s`) + open mouth/tongue + breathe 2.3s.
- Derived flags (from the handoff): `eyesClosed = pose==="sleep" || blink`;
  `mouthOpen = pose ∈ {wag,bark,celebrate}`.
- Reduced-motion: ambient/hop/zzz loops resolve to a static frame (animations `none`),
  consistent with phase 1's JS gating.

New keyframes in `index.css` (next to `tg-breathe` et al.): `tg-wag-fast`
(`rotate(-24deg)→rotate(28deg)`), `tg-hop` (translateY bounce
`0→-20px→0→-10px→0`), `tg-zzz` (opacity + rise + scale float).

### 3. `TuringCompanion` (existing) — pose resolution + contextual tips
- Consume `useTuring()` for `eventPose`/`asleep`. Keep local `mode` (hover `tilt`, tap
  `bark`), `blink`, `pupil`, `tipKey`.
- **Effective pose precedence:** `eventPose` (celebrate/wag) > `bark` (tapping) >
  `tilt` (hover) > `sleep` (asleep) > `idle`. Pass the result as `pose` to `TuringArt`.
- Tap still shows a tip bubble; tapping also counts as activity (wakes him).
- **Contextual tips:** on tap, pick from the bucket for the current route
  (`useLocation().pathname`), falling back to `general`.

### 4. Event wiring (mutation `onSuccess` hooks)
Call `useTuring().celebrate(big?)` from the success path of each chosen event. Hooks
(verify exact names at implementation time — base is `main` @ 159cce9):
- `useAddEntry` (`lib/journal.ts`) → `celebrate(false)` — small wag (journal save).
- `useLogSession` (`lib/progress.ts`) and `useApplyTemplate` (`lib/training-catalog.ts`)
  → `celebrate(false)` — small wag (training).
- `useFinalizeBrief` / `useShareBrief` (`lib/brief.ts`) and `useSendBrief`
  (`lib/brief-send.ts`) → `celebrate(true)` — big hop (brief milestones).

A hook can't call `useTuring()` conditionally, so the trigger is added either in the hook
body (top-level `useTuring()` + call in `onSuccess`) or at the call sites' `onSuccess`.
Implementation will prefer the hook body where the hook is the single source of the event.

## Contextual tip buckets (i18n)

`turing` catalog section gains buckets (en + es, parity enforced). Existing `tip1..tip6`
become the **general** bucket. New: `trainingTip1..3`, `journalTip1..3`, `weekTip1..2`,
`briefTip1..2`. A `TURING_TIP_BUCKETS: Record<TipContext, MessageKey[]>` map + a
`tipContextForPath(pathname)` helper (`…/training`→training, `…/journal` or `/my/journal`
→journal, `…/week`→week, `…/brief` or `/my/brief`→brief, else general).

Spanish copy is drafted at implementation time, reward-based and brand-consistent (the
owner is the native check). All new keys covered by the existing i18n parity test.

## Out of scope

- `sit` / `lie` poses (no event needs them — YAGNI).
- Sound, particles, or a settings toggle to disable Turing (could be a later slice).
- Driving poses from server/push events; everything is client-side off local mutations.

## Test plan (TDD)

- **turing-context:** `celebrate(false)`→`eventPose==="wag"`, `celebrate(true)`→`"celebrate"`,
  auto-clears after its duration (fake timers); idle timer flips `asleep` after 60s and any
  activity clears it; `useTuring()` no-op fallback without a provider.
- **pose resolution:** precedence table (event > bark > tilt > sleep > idle); reduced-motion
  yields static (no animation) groups; `sleep` shows the zzz group + closed lids.
- **contextual tips:** `tipContextForPath` maps representative routes; a tap on a training
  route shows a training-bucket tip (en); es-locale shows the Spanish bucket tip.
- **event wiring:** each targeted mutation hook calls `celebrate` with the right intensity
  on success (mock `useTuring`); error path does not celebrate.
- **regressions:** existing phase-1/2a behaviors stay green (bubble hidden→tap→3.6s hide,
  hover tilt, reduced-motion, aria-label, i18n parity).

## Verification

- `pnpm test` (web) green incl. new suites; `tsc` 0; Biome clean; build OK; react-doctor
  no new findings in changed files.
- Manual: sign in; save a journal entry → wag; finalize/share a brief → hop; leave the tab
  idle ~60s → sleeps with zzz, wakes on move; tap on the training page → a training tip;
  toggle ES → Spanish tips/label; narrow window → bubble still on-screen.
