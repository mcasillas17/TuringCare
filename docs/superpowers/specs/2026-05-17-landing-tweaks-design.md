# TuringCare — Landing Tweaks: remove in-page CTAs + Turing photo

**Date:** 2026-05-17
**Status:** Approved design — ready for implementation plan
**Scope:** `apps/web` only. No backend, no deps, OG image/README/docs untouched.

## Goal

1. Remove every call-to-action from the page body; CTAs live **only** in the
   sticky top bar (`SiteNav`).
2. Use Turing's real photo (owner-provided) in the hero and footer mentions,
   served as a small, optimized, **metadata-stripped** image.

## Part 1 — Remove in-page CTAs

`SiteNav` keeps its "Log in" + "Get started" (top bar — unchanged). Remove:

- **`apps/web/src/components/landing/hero.tsx`**: delete the `<Reveal delay={240}>`
  block containing the primary "Get started — it's free" and outline "Log in"
  buttons. Remove the now-unused `Button` and `Link` imports. The trailing
  "named after Turing…" caption stays; tighten its reveal delay (320 → 240) to
  fill the freed cadence slot.
- **`apps/web/src/components/landing/cta-band.tsx`**: **delete the file** (its
  sole purpose was the body CTA).
- **`apps/web/src/routes/landing.tsx`**: remove the `CtaBand` import and the
  `<CtaBand />` element. Final `<main>` order: `Hero → HowItWorks →
  BriefSpotlight → Philosophy → TrainersTeaser → Faq`, then `<SiteFooter />`.
- **`apps/web/src/components/landing/site-footer.tsx`**: remove the
  `<Link to="/login">Log in</Link>` from the footer nav; keep the `#how`,
  `#brief`, `#faq` anchor links.

## Part 2 — Turing photo (hero + footer; OG card unchanged)

### Asset handling (privacy + performance)

The owner committed the original at **`apps/web/assets/turing.jpg`** (and a
duplicate currently in `apps/web/public/turing.jpg`). The original is a
**3072×4080, ~4 MB Pixel 7 Pro JPEG whose EXIF includes GPS coordinates**.
`apps/web/public/` is served verbatim by Vite/Cloudflare Pages, so the raw file
must **never** ship.

- `apps/web/assets/turing.jpg` — source of record (committed, **not** served;
  `assets/` is source-only, like `og.svg`).
- `apps/web/public/turing.jpg` — **overwrite** with an optimized derivative:
  resized to ~640px on the long edge, JPEG quality ~80, **all EXIF/metadata
  (incl. GPS) stripped**, oriented per the original's EXIF orientation. Target
  well under ~120 KB.
- Produced by a one-off `npx` invocation (e.g. `npx --yes sharp-cli` — same
  transient pattern as `og.png`). **No project dependency added.** `sharp`
  strips metadata by default; the plan must still explicitly verify the
  resulting `public/turing.jpg` has **no EXIF/GPS** (e.g. `exiftool`/`identify`
  or `file` no longer shows "Exif"/GPS) and correct orientation.
- The controller will visually verify the optimized image (subagents can't see
  it) — must look like Turing, upright, not distorted.

### Hero

Keep the existing decorative merle-gradient blob. Add a small **circular framed
photo** inline with the existing "named after Turing, a blue-merle Mini American
Shepherd 🐾" caption: an `<img src="/turing.jpg">`, `rounded-full`,
`object-cover`, fixed ~`size-12`, subtle `ring-2 ring-copper/40`, lazy-loaded
(`loading="lazy"`, `decoding="async"`), `width`/`height` set to avoid layout
shift. `alt="Turing, a blue-merle Mini American Shepherd"`. Caption + photo sit
in the existing trailing `Reveal` (delay 240 after Part 1).

### Footer

In `site-footer.tsx`, prefix the "© … Built for Turing 🐾" line with a small
circular avatar (`<img src="/turing.jpg">`, ~`size-5` or `size-6`,
`rounded-full object-cover`, same alt, lazy). Keep the 🐾 or drop it — minor,
implementer's call for visual balance; the photo is the point.

## Testing (proportionate)

`apps/web/src/routes/landing.test.tsx`:
- The existing CTA-link assertion stays valid (SiteNav still renders a
  "Get started" link) — leave it.
- **Add**: the removed CtaBand heading is gone —
  `expect(screen.queryByRole("heading", { name: /start understanding your dog today/i })).toBeNull()`.
- **Add**: a Turing image renders —
  `expect(screen.getAllByRole("img", { name: /turing/i }).length).toBeGreaterThan(0)`
  (`getAllByRole`, not `getByRole`: both the hero and footer `<img>` share the
  same `alt`, so a single-match query would throw on the duplicate).

No other tests change. OG/`og-meta.test` untouched (OG image stays the CSS card
per the earlier decision).

## Verification

- `grep` shows no `<CtaBand` / `cta-band` references remain; `cta-band.tsx`
  deleted; hero has no `<Button>`/`Link` import; footer has no `/login` Link.
- `public/turing.jpg`: optimized (long edge ~640px, < ~120 KB), `file` reports
  **no Exif**, orientation correct; `assets/turing.jpg` retained as source.
- `pnpm --filter @turingcare/web test` (updated assertions pass), `typecheck`,
  `pnpm lint`, `build`, `pnpm -r exec tsc --noEmit`, `pnpm -r build` all green.
- Scope: only `apps/web/*` + the two image files + this spec/plan +
  PROJECT-LOG; no `package.json`/`pnpm-lock.yaml`, no `apps/api`.

## Out of scope

OG share image (stays the CSS card), README/spec docs, any backend/auth/route
change, dependency additions, additional photos or an "about" section.

## Flagged decisions (reasonable; reviewable)

- Hero keeps the gradient blob; photo is a small framed accent by the caption
  (per the approved choice), not a hero background.
- ~640px / q80 / metadata-stripped is a sensible web-avatar target; exact
  numbers tunable without design change as long as it's small and EXIF-free.
- Footer 🐾 emoji kept-or-dropped is a minor visual call, not a scope item.
