# TuringCare — Enlarge & center the hero Turing photo

**Date:** 2026-05-17
**Status:** Approved (user-selected the concrete option) — ready for plan.
**Scope:** one file — `apps/web/src/components/landing/hero.tsx`. Footer/OG/everything else unchanged.

## Problem

The hero Turing photo is only `size-12` (48 px), inline-left of the caption —
too small/under-emphasized.

## Approved change

In `hero.tsx`, the trailing `<Reveal delay={240}>` block currently is a
horizontal flex row: a 48 px `<img>` then the "named after Turing" `<p>`.
Replace it with a **vertically-stacked, centered** block:

- `<img>`: `size-40` (160 px), `width={160} height={160}`, keep
  `rounded-full object-cover loading="lazy" decoding="async"` and the same
  `alt="Turing, a blue-merle Mini American Shepherd"`; bump the ring to
  `ring-4 ring-copper/40` and add a soft `shadow-lg` (fits the larger size).
- Wrapper: `flex flex-col items-center gap-4` (photo above caption, centered),
  `mt-8`.
- Caption `<p>`: `max-w-sm text-center text-sm text-slate-soft/80` (unchanged
  text).

No other hero element changes (eyebrow/h1/subcopy/gradient untouched). The
footer avatar is **not** changed. `/turing.jpg` is the existing scrubbed asset.

## Testing / verification

`landing.test.tsx` already asserts `getAllByRole("img", { name: /turing/i })
.length > 0` — still satisfied (hero `<img>` remains, alt unchanged); **no test
change**. Gates: `pnpm --filter @turingcare/web test` (6 pass), `typecheck`,
`pnpm lint`, `build`, `pnpm -r exec tsc --noEmit`, `pnpm -r build` all green.
Controller visually confirms the rendered hero (large centered photo above the
caption) once built.

## Out of scope

Footer avatar, OG image, i18n, any other component, deps, backend.
