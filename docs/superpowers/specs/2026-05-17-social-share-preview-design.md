# TuringCare — Social Share Preview (Open Graph) + Favicon

**Date:** 2026-05-17
**Status:** Approved design — ready for implementation plan
**Sub-project:** D (independent of A rate-limiting, B i18n, C dog-CRUD)
**Scope:** Static metadata + image assets only. No app/route/backend changes.

## Problem

The deployed frontend is a Vite SPA. Link-preview crawlers (WhatsApp, iMessage,
Slack, Twitter, Facebook) fetch raw HTML and **do not execute JavaScript**. The
current `apps/web/index.html` `<head>` has only `charset`, `viewport`, and
`<title>TuringCare</title>` — no `description`, no Open Graph tags, no preview
image, no favicon. So sharing `https://turingcare.dog` shows no preview card.

## Goal

A correct, branded link preview on share (title, description, 1200×630 image)
plus a real favicon, shipped through the existing deploy pipeline, with **no new
runtime or build-time dependencies**.

## Decisions (locked)

- **Copy:** `og:title` = `TuringCare`; `og:description` = `Understand your dog. Train without force.` (mirrored to Twitter tags).
- **Image:** on-brand 1200×630 card — Turing slate `#28323d` background, copper/gold accent, paw glyph + "TuringCare" wordmark + the tagline.
- **Image production:** hand-authored SVG, rasterized **once** via a one-off `npx`
  tool to a committed PNG. No dependency added to the project; CI only serves the
  committed static file.
- **No Cloudflare/DNS changes.** Ships via the existing `deploy-web` job.

## Files

Scope-guarded — only these change:

- **`apps/web/index.html`** — add to `<head>` (static, crawler-visible):
  - `<meta name="description" content="Understand your dog. Train without force.">`
  - `<meta name="theme-color" content="#28323d">`
  - Open Graph: `og:type=website`, `og:site_name=TuringCare`,
    `og:title=TuringCare`,
    `og:description=Understand your dog. Train without force.`,
    `og:url=https://turingcare.dog/`,
    `og:image=https://turingcare.dog/og.png`,
    `og:image:width=1200`, `og:image:height=630`,
    `og:image:alt=TuringCare — humane, force-free dog training`
  - Twitter: `twitter:card=summary_large_image`, `twitter:title`,
    `twitter:description`, `twitter:image=https://turingcare.dog/og.png`
  - Icons: `<link rel="icon" type="image/svg+xml" href="/favicon.svg">`,
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`
- **`apps/web/public/og.png`** — 1200×630, **≤ 300 KB** (WhatsApp practical
  ceiling), PNG. Vite copies `public/` to the dist root → Cloudflare Pages serves
  it at the absolute `https://turingcare.dog/og.png` (absolute URL is required by
  WhatsApp/Facebook).
- **`apps/web/public/favicon.svg`** — small paw/wordmark mark, slate/copper.
- **`apps/web/public/apple-touch-icon.png`** — 180×180 (iOS home screen; some
  unfurlers fall back to it).
- **`apps/web/assets/og.svg`** and **`apps/web/assets/favicon.svg`** — committed
  SVG sources so the rasters can be regenerated later. (`assets/` is source, not
  served; `public/` is what ships.)

## Image Production (one-off, not in CI)

1. Author `apps/web/assets/og.svg` (1200×630) and the favicon SVG by hand using
   the brand palette already in `index.css`.
2. Rasterize once locally with a no-install one-off, e.g.
   `npx --yes @resvg/resvg-js-cli assets/og.svg public/og.png` (or an equivalent
   `npx sharp`/resvg invocation). Produce `apple-touch-icon.png` (180×180) from
   the favicon SVG the same way.
3. Verify dimensions (1200×630 / 180×180) and `og.png` size ≤ 300 KB.
4. Commit the SVG sources **and** the generated PNGs. Nothing is added to
   `package.json`; the rasterizer is invoked transiently via `npx` and is not a
   project dependency.

## Error Handling

Static assets — no runtime branches. Failure modes are operational, documented:
- Crawler can't reach `og.png` → no image card. Mitigated by serving from the
  same Cloudflare Pages origin as the site (absolute HTTPS URL).
- WhatsApp/Facebook **cache previews aggressively**. After deploy, force a
  re-scrape via the Facebook Sharing Debugger
  (`https://developers.facebook.com/tools/debug/?q=https://turingcare.dog`);
  WhatsApp's fetcher honors that refresh. First shares before re-scrape may show
  stale/no preview.

## Testing (proportionate)

One small Vitest test in `apps/web` (`src/og-meta.test.ts`):
- Reads `apps/web/index.html` from disk; asserts it contains `og:title`,
  `og:description`, `og:image` (the absolute `https://turingcare.dog/og.png`),
  `twitter:card`, the `description` meta, and the `favicon.svg` link.
- Asserts `apps/web/public/og.png` exists and is ≤ 300 KB.
This is a static deliverable; the test guards the crawler-critical contract and
the size budget, not pixels.

## Verification

- `pnpm --filter @turingcare/web typecheck`, `pnpm lint`,
  `pnpm --filter @turingcare/web test`, `pnpm --filter @turingcare/web build`
  all green; `pnpm -r exec tsc --noEmit` exit 0.
- Local: `dist/og.png`, `dist/favicon.svg`, `dist/apple-touch-icon.png` present
  after build; `dist/index.html` contains the meta tags.
- Post-deploy: Facebook Sharing Debugger renders title/description/image; a
  WhatsApp share of `https://turingcare.dog` shows the card (after re-scrape).
- No regression: `/`, `/login`, `/register`, `/app` unchanged; `apps/api`
  untouched; no new dependencies in `package.json`/lockfile.

## Out of Scope

No dynamic/per-route OG tags (SPA has one shareable URL), no per-locale OG
(crawlers don't localize; revisit only if B requires it), no analytics, no
sitemap/robots (separate SEO task if ever wanted), no Cloudflare/DNS changes.

## Flagged Choices (reasonable defaults; reviewable)

- Single static OG image for the whole site (one shareable URL today).
- SVG favicon + `apple-touch-icon.png` only (modern-browser baseline); no legacy
  multi-size `.ico` bundle unless old-client support is later required.
- Rasterizer tool chosen at implementation time (resvg or sharp via `npx`),
  whichever reliably produces a ≤300 KB 1200×630 PNG; flagged in the summary.
