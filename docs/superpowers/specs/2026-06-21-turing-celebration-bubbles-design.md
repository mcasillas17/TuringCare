# Spec: Turing — celebration bubbles + anti-fatigue cooldown — phase 2d

**Date:** 2026-06-21
**Branch:** `worktree-feat+turing-celebration-bubbles` (off `main` @ `ce8e5bb`)
**Status:** Design — approved (direction); pending spec review
**Predecessor:** phase 2c connect-all-events (PR #51, merged)

## Why

2c connected Turing to many events, but every hop is **silent and identical** — "added your
first dog" looks the same as "finished onboarding." Motion alone carries no meaning. And as
triggers multiplied, the new risk is **fatigue**: routine saves can wag repeatedly. This
phase gives milestones a short message and throttles the frequent wags.

## Owner decisions (confirmed)

- **Text bubble on big celebrations (hop) only.** Wags (journal/session/template/goal) stay
  silent — the routine "nod" stays subtle.
- Anti-fatigue **cooldown** on wags; hops always play.

## Design

### A. Message-carrying celebrate (`turing-context.tsx`)
Extend the API: `celebrate(big?: boolean, messageKey?: MessageKey)`.
- New context state `eventMessage: MessageKey | null`, exposed on `useTuring()` (no-op
  fallback returns `null`). It is set **only for hops** (`big === true`); a wag always sets
  `eventMessage` to `null` even if a key is passed (defends the "wags silent" rule).
- `eventMessage` clears together with `eventPose` on the existing pose timer.
- Message is set regardless of `prefers-reduced-motion` — under reduced motion the hop is
  suppressed but the **message still shows** (accessible acknowledgment).

### B. Wag cooldown (`turing-context.tsx`)
- Constant `WAG_COOLDOWN_MS = 8000`.
- A `wagCooldown` ref (boolean) + its own timer. On any celebrate that plays, arm the
  cooldown (set true, schedule clear after `WAG_COOLDOWN_MS`).
- A **wag** is skipped entirely (early `return`, no state change) if `wagCooldown` is active.
- A **hop** bypasses the check (always plays) and re-arms the cooldown — so a wag right after
  a milestone is also throttled.
- Clean up the cooldown timer on unmount alongside the existing timers.

### C. Bubble rendering (`turing-companion.tsx`)
- Consume `eventMessage`. The bubble key becomes `eventMessage ?? tipKey` (a live
  celebration message takes precedence over a tap tip). Render `t(bubbleKey)` in the existing
  `<output className="turing-bubble">`; the bubble shows when `bubbleKey` is non-null.
- No new CSS — the existing `.turing-bubble` (and its reduced-motion-gated pop-in) is reused.

### D. Message copy (`i18n` `turing` section, en + es, parity-enforced)
| key | en | es |
|---|---|---|
| celebrateDog | New pup! 🐾 | ¡Nuevo cachorro! 🐾 |
| celebrateMastery | Mastered it! 🎉 | ¡Dominado! 🎉 |
| celebrateOnboarding | You're all set! 🎉 | ¡Todo listo! 🎉 |
| celebrateWeek | Week done! 🏅 | ¡Semana completa! 🏅 |
| celebrateBrief | Brief ready! 📋 | ¡Resumen listo! 📋 |

### E. Wire messages into the hop triggers
Pass the key as the 2nd arg on each hop; wags are unchanged (`celebrate(false)`, one arg):
- `useCreateDog` (lib/dogs.ts) → `celebrate(true, "turing.celebrateDog")`
- `useUpdateSkillConfidence` (lib/progress.ts) → branch: `if (mastered) celebrate(true,
  "turing.celebrateMastery"); else celebrate(false);` (keeps the non-mastery call exactly
  `celebrate(false)`)
- onboarding `checklist.tsx` → `celebrate(true, "turing.celebrateOnboarding")`
- `dog-week.tsx` → `celebrate(true, "turing.celebrateWeek")`
- `useFinalizeBrief` / `useShareBrief` (lib/brief.ts) + `useSendBrief` (lib/brief-send.ts) →
  `celebrate(true, "turing.celebrateBrief")`
- Unchanged wags: `useAddEntry`, `useLogSession`, `useApplyTemplate`, `useAddGoal` → `celebrate(false)`.

## Test plan (TDD)

- **context:** `celebrate(true, key)` sets `eventMessage=key`; `celebrate(false, key)` keeps
  `eventMessage` null (wag silent); message clears with the pose; **cooldown:** a 2nd wag
  within 8s is ignored (pose stays null / not re-triggered); a hop plays even during the wag
  cooldown; after a hop, a following wag is suppressed; reduced-motion still sets the message.
- **component:** with `useTuring` mocked to return an `eventMessage`, the bubble renders that
  message; `eventMessage` takes precedence over a tap `tipKey`.
- **triggers:** update existing `turing-triggers.test.tsx` hop assertions to the 2-arg form
  (`toHaveBeenCalledWith(true, "turing.celebrateX")`); wag/error assertions stay `(false)` /
  not-called. Add the new keys' coverage via the i18n parity test (automatic).
- Regression: full suite green; i18n parity green.

## Verification

- `pnpm test` green; `tsc` 0; **root** `pnpm biome check .` clean; build OK; react-doctor no
  new findings on changed files.
- Manual (demo harness or app): finalize a brief → hop **with "Brief ready! 📋"**; master a
  skill → "Mastered it! 🎉"; rapid journal saves → only the first wags (cooldown); ES toggle →
  Spanish messages; reduced-motion → message shows without the hop.
