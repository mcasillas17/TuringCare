# Spec: Turing companion — polish (bubble-fit + Spanish) — phase 2a

**Date:** 2026-06-21
**Branch:** `worktree-feat+turing-polish-i18n` (off `main` @ `66cbc04`)
**Status:** Approved (design); implementing
**Predecessor:** Turing companion phase 1 (PR #46, merged `8cbc38b`)

> **Historical phase design:** Its en/es behavior remains, but the catalogs now live in
> `@turingcare/i18n` and resolve through the shared i18next runtime described in
> `../../LOCALIZATION.md`.

## Background

Phase 1 shipped Turing as a corner mascot. Two issues surfaced once it was live:

1. **The tip bubble overflows the right edge of the window.** Turing is fixed in the
   bottom-**right** corner, but the bubble is centered on him (`left:50%;
   transform:translateX(-40%)`) and grows rightward (`width:max-content`, up to 184px),
   so it spills off-screen.
2. **The widget is English-only.** The 6 tips and the button `aria-label` are hardcoded
   English; the app otherwise supports en/es via a typed i18n catalog with a parity test.

This is a deliberately small slice (phase 2a). The larger 8-pose, event-driven mascot is
phase 2b and is **out of scope** here.

## Scope

In scope:
- Re-anchor the speech bubble so it opens **up-and-left** from Turing and never exceeds
  the viewport width.
- Localize the 6 tips and the `aria-label` through the existing `i18n` catalogs (en + es),
  covered by the existing parity test.

Out of scope (phase 2b): the 8-pose `state` variant, a `TuringProvider`/`playPose()`
trigger, event-driven `celebrate` (journal save / training session / brief finalize-send),
idle→`sleep`, and contextual/per-route tips.

## Design

### Bubble fits the window (`index.css`)
- `.turing-bubble`: replace `left:50%; transform:translateX(-40%)` with right-anchoring —
  `right: 0; left: auto; transform: none;` — so the bubble grows leftward, into the screen.
- Cap width to the viewport: `max-width: min(184px, calc(100vw - 24px))`.
- `.turing-bubble-tip` (the little pointer): move from `left:32%` to the right side
  (`right: 28px; left: auto;`) so it still points down at Turing's head.
- `@keyframes tg-bubble`: drop the `translateX(-40%)` from both stops (it assumed the old
  centering); keep opacity + slight `translateY` + `scale`. Reduced-motion gating unchanged.

### Spanish (`i18n` + component)
- Add a `turing` section to `en.ts` **and** `es.ts`:
  - `tip1`…`tip6` — the six tips.
  - `tipAria` — the button label ("Turing — tap for a training tip").
- `turing-tips.ts`: export `TURING_TIP_KEYS: MessageKey[]` = `["turing.tip1", …, "turing.tip6"]`
  (the catalog is the source of the strings; this module just lists the keys).
- `turing-companion.tsx`: call `useI18n()`; `aria-label={t("turing.tipAria")}`; on click pick
  a random **key**, store it in state, render `t(key)`. Storing the key (not the resolved
  string) keeps the bubble locale-correct. The component already renders inside
  `LocaleProvider` (AppShell); `useI18n()` has an en fallback for bare-render tests.

Spanish strings (reward-based, brand voice):
| key | en | es |
|---|---|---|
| tip1 | Catch him being good — then reward it. | Sorpréndelo portándose bien y prémialo. |
| tip2 | Mark the moment, then treat. | Marca el momento y luego premia. |
| tip3 | Short sessions beat long ones. | Las sesiones cortas funcionan mejor que las largas. |
| tip4 | Reward what you want repeated. | Premia lo que quieras que se repita. |
| tip5 | Calm earns the treat, not the jump. | La calma gana el premio, no el salto. |
| tip6 | End every session on a win. | Termina cada sesión con un logro. |
| tipAria | Turing — tap for a training tip | Turing — toca para ver un consejo |

## Test plan (TDD)

- Bubble shown after click is one of the resolved **en** tips (replaces the hardcoded
  string-array assertion).
- `TURING_TIP_KEYS` are exactly the six `turing.tip*` keys.
- Rendered inside `LocaleProvider` with `locale="es"`, the `aria-label` is the Spanish
  label and a clicked tip is one of the Spanish tips.
- Existing behaviors stay green: bubble hidden until click, hides after 3.6s, reduced
  motion disables ambient animation.
- i18n parity test (existing) automatically enforces es↔en key parity + non-identical es.

CSS positioning (the "fits the window" geometry) can't be asserted under jsdom — verified
manually: `pnpm dev`, sign in, tap Turing in a narrow window and confirm the bubble stays
fully on-screen.

## Verification

- `pnpm test` (apps/web) green incl. updated/new turing + i18n parity tests.
- `tsc` 0, Biome clean, build OK, React Doctor no regression.
- Manual: bubble on-screen at narrow widths; EN/ES toggle flips tips + aria-label.
