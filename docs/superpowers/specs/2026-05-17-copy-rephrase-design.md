# TuringCare — Copy Rephrase: "force-free" → positive framing

**Date:** 2026-05-17
**Status:** Approved design — ready for implementation plan
**Scope:** `apps/web` user-facing copy + share assets only. No backend, no deps, no DNS.

## Goal

The owner dislikes the "force-free" / "without force" negative framing. Replace
it across the live site with positive-reinforcement / reward-based phrasing,
used **contextually** (all three approved phrasings, whichever reads best per
spot — not a rigid find-replace).

## Exact changes (before → after)

### Hero + share copy

| File / location | Before | After |
|---|---|---|
| `apps/web/src/components/landing/hero.tsx` H1 emphasis span | `Train without force.` | `Train with positive reinforcement.` |
| `hero.tsx` eyebrow chip | `Force-free · Science-based` | `Positive reinforcement · Science-based` |
| `hero.tsx` subcopy | `…your force-free trainer can actually use.` | `…your positive-reinforcement trainer can actually use.` |
| `apps/web/index.html` `meta name="description"` | `Understand your dog. Train without force.` | `Understand your dog. Train with positive reinforcement.` |
| `index.html` `og:description` | same old line | `Understand your dog. Train with positive reinforcement.` |
| `index.html` `twitter:description` | same old line | `Understand your dog. Train with positive reinforcement.` |
| `index.html` `og:image:alt` | `TuringCare — humane, force-free dog training` | `TuringCare — humane, positive-reinforcement dog training` |

### Share image regeneration

- `apps/web/assets/og.svg`: the tagline `<text>` line changes from
  `Understand your dog. Train without force.` to
  `Understand your dog. Train with positive reinforcement.`. The new line is
  longer; reduce that `<text>` `font-size` from `44` to `40` so it stays within
  the 1200px canvas with comfortable margin. No other SVG element changes.
- Regenerate `apps/web/public/og.png` from the updated SVG using the same
  one-off `npx` rasterizer used originally (resvg; Playwright HTML-screenshot
  fallback if fonts don't render). Must remain 1200×630 PNG, < 300 000 bytes.
  **The controller will visually verify the regenerated PNG** (a subagent can't
  see it) — the new tagline must be fully visible, not clipped.
- No new dependency may be added (transient `npx` only).

### Literal "force-free" in landing copy (varied)

| File | Before → After |
|---|---|
| `philosophy.tsx` H2 | `Force-free isn't a feature. It's the whole point.` → `Positive reinforcement isn't a feature. It's the whole point.` |
| `brief-spotlight.tsx` | `…force-free trainer can act on immediately.` → `…reward-based trainer can act on immediately.` |
| `how-it-works.tsx` | `…force-free trainer can act on.` → `…reward-based trainer can act on.` |
| `trainers-teaser.tsx` heading | `Find a force-free trainer who fits` → `Find a positive-reinforcement trainer who fits` |
| `trainers-teaser.tsx` `TAGS` array | `"Force-free"` → `"Reward-based"` (the array already contains a `"Positive reinforcement"` tag; using that would duplicate, so `"Reward-based"` here) |
| `faq.tsx` question | `Is it really force-free?` → `Is it really positive reinforcement?` (the answer text — "…built around reward-based, science-supported methods… no prong collars, shock, or fear-based techniques" — is unchanged) |
| `site-footer.tsx` | `Humane, force-free dog training support.` → `Humane, reward-based dog training support.` |

No other occurrences exist in `apps/web/src` / `apps/web/index.html` (verified by
`grep -rniE 'force[- ]free|without force'`). If implementation finds any
additional occurrence in `apps/web`, apply the same positive-framing treatment
and note it.

### Test updates (required — same change, not weakening)

- `apps/web/src/routes/landing.test.tsx`:
  - heading assertion `/train without force/i` → `/train with positive reinforcement/i`
  - FAQ trigger assertion `/is it really force-free/i` → `/is it really positive reinforcement/i`
  - the FAQ answer assertion `/reward-based, science-supported/i` **stays** (answer unchanged)
- `apps/web/src/og-meta.test.ts`:
  - the `name="description"` and `property="og:description"` asserted strings →
    `Understand your dog. Train with positive reinforcement.`
  - it does **not** assert `og:image:alt`, so the alt change is safe.

## Out of scope

- `README.md`, `docs/**` design specs/plans, and `SECURITY-BACKLOG.md` still
  contain "force-free" — these are repo docs, not "the website." Left as-is
  (can be cleaned up later as a separate trivial docs pass if desired).
- No change to Better Auth, schema, routing, or any non-copy behavior.
- No visual/layout change beyond the single og.svg font-size nudge needed to fit
  the longer tagline.

## Error handling

Pure static copy/asset change — no runtime branches. The only failure mode is
the OG raster: if the longer tagline clips at font-size 40, reduce further
(38) or wrap; acceptance is "tagline fully visible, 1200×630, <300KB",
controller-verified visually.

## Testing

The two updated test files are the proportionate guard (landing render +
metadata contract). Full gate: `pnpm --filter @turingcare/web test` (6 pass),
`typecheck`, `pnpm lint`, `build`, `pnpm -r exec tsc --noEmit`, `pnpm -r build`.
WhatsApp/OG cache: post-deploy FB Sharing Debugger re-scrape (carried in the
plan's post-implementation note).

## Verification

- All "force-free"/"without force" gone from `apps/web/src` + `index.html`
  (`grep` returns nothing).
- Regenerated `og.png` visually shows the new tagline, 1200×630, <300KB.
- Tests green; no `package.json`/`pnpm-lock.yaml` change; only `apps/web/*`
  (+ this spec/plan + PROJECT-LOG entry) differs.
- `landing.test.tsx` still asserts the unchanged hero structure and the
  unchanged FAQ answer text.

## Flagged choices (reasonable; reviewable)

- Contextual mix of the three phrasings (per the approved "all three" choice):
  "positive reinforcement" for headline/chip/philosophy/FAQ/trainers-heading,
  "reward-based" for the trainer-mention sentences/footer/tag. Tunable wording,
  no structural impact.
- og.svg tagline font-size 44→40 (single decorative value) to fit the longer
  line; controller visually confirms.
