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

### Asset handling (privacy-critical + performance)

The owner-provided original exists locally at **`apps/web/assets/turing.jpg`**
and **`apps/web/public/turing.jpg`** — both are the **3072×4080, ~4 MB Pixel 7
Pro JPEG whose EXIF includes GPS coordinates**. The GitHub repo is **public**, so
the GPS-tagged original must **never enter git history** in any location.

Rules (user-approved):

- **The GPS original is never committed anywhere.** Add the source path to
  `.gitignore` so it cannot be staged by accident: a line
  `apps/web/assets/turing.jpg` in the repo root `.gitignore` (it must be a
  specific path, not all of `assets/`, since `assets/og.svg` and
  `assets/favicon.svg` are committed). Keep `apps/web/assets/turing.jpg`
  on disk locally only, for future regeneration.
- **Only the scrubbed derivative is committed**, at `apps/web/public/turing.jpg`
  (served by Vite/Cloudflare Pages). The raw 4 MB file currently sitting at that
  path must be **replaced in place** by the derivative *before* any `git add`;
  the raw bytes must never be the committed content.
- Derivative spec: resized to ~640px on the long edge, JPEG quality ~80,
  EXIF-orientation applied then **all metadata removed** — EXIF, GPS, XMP, IPTC,
  ICC, **and any embedded thumbnail** (thumbnails can independently carry GPS).
  Target well under ~120 KB.
- Production: one-off transient `npx` (e.g. `npx --yes sharp-cli` resize +
  re-encode, same pattern as `og.png`) **then** an explicit
  `npx --yes exiftool -all= -overwrite_original apps/web/public/turing.jpg`
  belt-and-suspenders scrub. **No project dependency added.**
- **Mandatory verification (privacy gate):** `npx --yes exiftool
  apps/web/public/turing.jpg` must show **no EXIF/GPS/XMP/IPTC/thumbnail** (only
  inert basics like dimensions/filetype), and `file apps/web/public/turing.jpg`
  must no longer report `Exif`. Additionally confirm the *committed* blob is
  clean: `git show :apps/web/public/turing.jpg | npx --yes exiftool -` shows no
  GPS/EXIF. If any metadata remains, the task is BLOCKED — do not commit.
- No anti-download JS/CSS deterrents (user chose metadata-strip-only; a
  displayed web image is inherently downloadable — not faked).
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
- **Privacy gate (must pass before commit):** `npx exiftool
  apps/web/public/turing.jpg` shows no EXIF/GPS/XMP/IPTC/thumbnail; `file`
  reports no `Exif`; `git show :apps/web/public/turing.jpg | npx exiftool -`
  (post-stage) is clean; `apps/web/assets/turing.jpg` is gitignored and **not**
  tracked (`git ls-files | grep turing` lists only `public/turing.jpg`).
- `public/turing.jpg`: optimized (long edge ~640px, < ~120 KB), orientation
  correct, the committed content is the scrubbed derivative (not the 4 MB raw).
- `pnpm --filter @turingcare/web test` (updated assertions pass), `typecheck`,
  `pnpm lint`, `build`, `pnpm -r exec tsc --noEmit`, `pnpm -r build` all green.
- Scope: only `apps/web/*` (incl. deleted cta-band, the scrubbed
  `public/turing.jpg`), the root `.gitignore` line, this spec/plan, and
  PROJECT-LOG; no `package.json`/`pnpm-lock.yaml`, no `apps/api`. The
  GPS-tagged `assets/turing.jpg` never appears in `git diff`/history.

## Out of scope

OG share image (stays the CSS card), README/spec docs, any backend/auth/route
change, dependency additions, additional photos or an "about" section.

## Flagged decisions (reasonable; reviewable)

- Hero keeps the gradient blob; photo is a small framed accent by the caption
  (per the approved choice), not a hero background.
- ~640px / q80 / metadata-stripped is a sensible web-avatar target; exact
  numbers tunable without design change as long as it's small and EXIF-free.
- Footer 🐾 emoji kept-or-dropped is a minor visual call, not a scope item.
