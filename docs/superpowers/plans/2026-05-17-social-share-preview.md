# Social Share Preview (Open Graph) + Favicon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `https://turingcare.dog` a correct, branded link-preview card (title, description, 1200×630 image) and a real favicon, via static HTML metadata + committed image assets.

**Architecture:** Pure static assets — crawler-visible `<meta>` tags hard-coded in `apps/web/index.html` (SPA crawlers don't run JS), and PNG/SVG icons in `apps/web/public/` which Vite copies to the dist root so Cloudflare Pages serves them at absolute URLs. Images are hand-authored SVGs rasterized **once** via a transient `npx` tool to committed PNGs — no project dependency.

**Tech Stack:** Static HTML + SVG; one-off `npx` rasterizer (resvg, with a Playwright fallback); Vitest for the metadata contract test.

**Spec:** `docs/superpowers/specs/2026-05-17-social-share-preview-design.md`

**Conventions:** Work on `main` (continuously deployed; user pushes at the end of the cycle). gpg-unsigned commits ending with:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
`git -c commit.gpgsign=false commit -m "<subject>" -m "<trailer>"`. No new entries in `package.json`/lockfile. No changes outside `apps/web/index.html`, `apps/web/public/*`, `apps/web/assets/*`, and one test file.

---

## File Structure

```
apps/web/
  assets/
    og.svg               CREATE  source for the 1200×630 share card (committed, not served)
    favicon.svg          CREATE  source for the icon (committed; also served — see note)
  public/
    og.png               CREATE  1200×630 rasterized card, ≤300 KB (served at /og.png)
    favicon.svg           CREATE  copy of the icon (served at /favicon.svg)
    apple-touch-icon.png  CREATE  180×180 rasterized icon (served at /apple-touch-icon.png)
  index.html             MODIFY  add description + Open Graph + Twitter + icon <link> + theme-color
  src/og-meta.test.ts    CREATE  asserts the metadata contract + og.png size budget
```

Note: `assets/favicon.svg` and `public/favicon.svg` are the same bytes — `assets/` keeps the editable source alongside `og.svg`; `public/favicon.svg` is the served copy (Vite only ships `public/`).

---

## Task 1: Author brand SVGs and rasterize to committed images

**Files:**
- Create: `apps/web/assets/og.svg`, `apps/web/assets/favicon.svg`, `apps/web/public/og.png`, `apps/web/public/favicon.svg`, `apps/web/public/apple-touch-icon.png`

- [ ] **Step 1: Create `apps/web/assets/og.svg`** (1200×630, brand palette, no emoji/exotic features so it rasterizes deterministically)

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#28323d"/>
  <!-- soft merle accent (decorative) -->
  <circle cx="1010" cy="120" r="300" fill="#4a5c6e" opacity="0.45"/>
  <circle cx="1120" cy="40" r="160" fill="#7fb8d6" opacity="0.30"/>
  <!-- paw mark in copper -->
  <g fill="#c8893b" transform="translate(96 250)">
    <ellipse cx="34" cy="40" rx="22" ry="28"/>
    <ellipse cx="86" cy="20" rx="20" ry="26"/>
    <ellipse cx="138" cy="32" rx="21" ry="27"/>
    <path d="M16 96 C16 58 156 58 156 96 C156 140 116 168 86 168 C56 168 16 140 16 96 Z"/>
  </g>
  <text x="96" y="470" font-family="Arial, Helvetica, sans-serif" font-size="104" font-weight="800" fill="#faf6ef">TuringCare</text>
  <text x="100" y="540" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="500" fill="#c9d4dd">Understand your dog. Train without force.</text>
  <text x="100" y="596" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600" fill="#e0a85a">turingcare.dog</text>
</svg>
```

- [ ] **Step 2: Create `apps/web/assets/favicon.svg`** (square, legible at 16px — rounded slate tile + copper paw)

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#28323d"/>
  <g fill="#c8893b" transform="translate(13 16)">
    <ellipse cx="9" cy="11" rx="6" ry="7.5"/>
    <ellipse cx="22" cy="6" rx="5.5" ry="7"/>
    <ellipse cx="34" cy="11" rx="6" ry="7.5"/>
    <path d="M4 30 C4 19 39 19 39 30 C39 42 29 49 21.5 49 C14 49 4 42 4 30 Z"/>
  </g>
</svg>
```

- [ ] **Step 3: Copy the favicon source into `public/`**

Run: `cp apps/web/assets/favicon.svg apps/web/public/favicon.svg`
Expected: `apps/web/public/favicon.svg` exists, byte-identical to the source.

- [ ] **Step 4: Rasterize `og.svg` → `apps/web/public/og.png` (1200×630)**

Primary command (resvg, transient — not added to the project):
```bash
cd apps/web && npx --yes @resvg/resvg-js-cli assets/og.svg public/og.png && cd -
```
Then verify dimensions and size:
```bash
file apps/web/public/og.png            # must report 1200 x 630
ls -l apps/web/public/og.png           # bytes must be < 300000
```
Expected: `og.png` is exactly 1200×630 and < 300 KB.

If resvg renders **no text** (missing system fonts) or the package/CLI is unavailable, use the documented fallback — render via headless Chromium, which always has fonts:
```bash
# Fallback: wrap the SVG in minimal HTML and screenshot it
printf '<!doctype html><meta charset=utf-8><body style="margin:0">%s</body>' "$(cat apps/web/assets/og.svg)" > /tmp/og.html
npx --yes playwright@latest screenshot --browser chromium --viewport-size 1200,630 --full-page=false /tmp/og.html apps/web/public/og.png
file apps/web/public/og.png            # must report 1200 x 630
ls -l apps/web/public/og.png           # < 300000 bytes
```
Document in the task report which path was used. Acceptance is identical either way: a 1200×630 PNG < 300 KB that visibly shows the "TuringCare" wordmark and the tagline (open it and confirm the text rendered — if blank text, you used the wrong path; switch to the fallback).

- [ ] **Step 5: Rasterize the favicon → `apps/web/public/apple-touch-icon.png` (180×180)**

```bash
cd apps/web && npx --yes @resvg/resvg-js-cli --width 180 --height 180 assets/favicon.svg public/apple-touch-icon.png && cd -
file apps/web/public/apple-touch-icon.png   # 180 x 180
```
(If the resvg fallback was needed in Step 4, use the same Playwright approach at `--viewport-size 180,180` against the favicon SVG.) Expected: a 180×180 PNG.

- [ ] **Step 6: Confirm no dependency was added**

Run: `git status --porcelain package.json pnpm-lock.yaml apps/web/package.json`
Expected: **no output** (npx is transient; nothing added to manifests/lockfile). If anything shows, revert that change — the rasterizer must not become a project dependency.

- [ ] **Step 7: Commit**

```bash
git add apps/web/assets/og.svg apps/web/assets/favicon.svg apps/web/public/og.png apps/web/public/favicon.svg apps/web/public/apple-touch-icon.png
git -c commit.gpgsign=false commit -m "feat(web): brand OG share image + favicon assets" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Add metadata to `index.html`

**Files:**
- Modify: `apps/web/index.html`

- [ ] **Step 1: Read the current file**

Run: `cat apps/web/index.html`
Expected: a minimal document — `<head>` has `charset`, `viewport`, `<title>TuringCare</title>`; `<body>` has `<div id="root">` + the `/src/main.tsx` module script. Do not change `<body>` or the title element's position.

- [ ] **Step 2: Replace the `<head>` so it contains exactly this** (keep `<body>` untouched)

```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TuringCare</title>
    <meta name="description" content="Understand your dog. Train without force." />
    <meta name="theme-color" content="#28323d" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="TuringCare" />
    <meta property="og:title" content="TuringCare" />
    <meta property="og:description" content="Understand your dog. Train without force." />
    <meta property="og:url" content="https://turingcare.dog/" />
    <meta property="og:image" content="https://turingcare.dog/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="TuringCare — humane, force-free dog training" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="TuringCare" />
    <meta name="twitter:description" content="Understand your dog. Train without force." />
    <meta name="twitter:image" content="https://turingcare.dog/og.png" />
  </head>
```

- [ ] **Step 3: Verify the build still emits these tags and the assets**

Run: `pnpm --filter @turingcare/web build`
Then:
```bash
grep -q 'og:image" content="https://turingcare.dog/og.png"' apps/web/dist/index.html && echo OG_OK
test -f apps/web/dist/og.png && test -f apps/web/dist/favicon.svg && test -f apps/web/dist/apple-touch-icon.png && echo ASSETS_OK
```
Expected: `OG_OK` and `ASSETS_OK` (Vite injects nothing that strips these; `public/` assets are copied to `dist/` root).

- [ ] **Step 4: Commit**

```bash
git add apps/web/index.html
git -c commit.gpgsign=false commit -m "feat(web): open graph + twitter + favicon meta tags" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Metadata contract test + full verification gate

**Files:**
- Create: `apps/web/src/og-meta.test.ts`

- [ ] **Step 1: Write the test**

`apps/web/src/og-meta.test.ts`:

```ts
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url)); // apps/web/

it("index.html exposes the crawler share metadata", () => {
  const html = readFileSync(`${root}index.html`, "utf8");
  expect(html).toContain('name="description" content="Understand your dog. Train without force."');
  expect(html).toContain('property="og:title" content="TuringCare"');
  expect(html).toContain(
    'property="og:description" content="Understand your dog. Train without force."',
  );
  expect(html).toContain('property="og:image" content="https://turingcare.dog/og.png"');
  expect(html).toContain('property="og:url" content="https://turingcare.dog/"');
  expect(html).toContain('name="twitter:card" content="summary_large_image"');
  expect(html).toContain('rel="icon" type="image/svg+xml" href="/favicon.svg"');
});

it("og.png exists and is within WhatsApp's size budget", () => {
  const png = statSync(`${root}public/og.png`);
  expect(png.isFile()).toBe(true);
  expect(png.size).toBeGreaterThan(0);
  expect(png.size).toBeLessThan(300_000);
});
```

- [ ] **Step 2: Run it, verify it passes**

Run: `pnpm --filter @turingcare/web test og-meta`
Expected: PASS — 2 passing (Tasks 1–2 already created the assets/tags). If the metadata assertions fail, the `index.html` strings in Task 2 don't match exactly — fix `index.html`, not the test. If the size assertion fails, re-rasterize `og.png` smaller (Task 1).

- [ ] **Step 3: Full gate — all must pass**

Run each:
- `pnpm --filter @turingcare/web test` → all pass (use-in-view 2 + landing 2 + og-meta 2 = 6)
- `pnpm --filter @turingcare/web typecheck` → 0 errors
- `pnpm lint` → 0 errors (`pnpm format` then re-check if Biome flags formatting only; logic unchanged)
- `pnpm --filter @turingcare/web build` → succeeds; re-confirm `OG_OK`/`ASSETS_OK` from Task 2 Step 3
- `pnpm -r exec tsc --noEmit` → exit 0
- `pnpm -r build` → all workspaces build

- [ ] **Step 4: Confirm no dependency/scope drift**

Run: `git status --porcelain && git diff --stat origin/main -- package.json pnpm-lock.yaml apps/api`
Expected: clean working tree; **no** changes to `package.json`, `pnpm-lock.yaml`, or `apps/api`. Only `apps/web/{index.html,assets/*,public/*,src/og-meta.test.ts}` differ from `origin/main` for this sub-project (plus the committed spec/plan docs).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/og-meta.test.ts
git -c commit.gpgsign=false commit -m "test(web): assert share metadata contract + og.png size budget" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Post-Implementation (controller, after push)

Not a code task — record in the final summary so the user can act:
- After `deploy-web` ships, force the crawler cache refresh via the Facebook
  Sharing Debugger: `https://developers.facebook.com/tools/debug/?q=https://turingcare.dog`
  → "Scrape Again". WhatsApp's fetcher honors this; a fresh WhatsApp share then
  shows the card. First shares before re-scrape may show stale/no preview.

---

## Self-Review

**Spec coverage:** `index.html` description/OG/Twitter/icons/theme-color → Task 2; `public/og.png` 1200×630 ≤300 KB served at absolute URL → Task 1 (Vite `public/`→dist root confirmed Task 2 Step 3); `favicon.svg` + `apple-touch-icon.png` → Task 1; committed SVG sources in `assets/` → Task 1; one-off `npx` rasterization with **no project dependency** → Task 1 Steps 4–6 (+ explicit guard Step 6); proportionate metadata-contract + size test → Task 3; WhatsApp cache caveat / FB debugger → Post-Implementation; scope guard (no app/route/backend/deps) → Task 3 Step 4. All spec sections mapped, including the flagged rasterizer-tool choice (primary resvg + documented Playwright fallback, same acceptance criteria).

**Placeholder scan:** none — full SVG/HTML/test content given, exact commands with expected output, documented fallback path (not a TODO).

**Type/consistency:** copy string "Understand your dog. Train without force." identical across `index.html` (Task 2), the test assertions (Task 3), and the spec; image path `https://turingcare.dog/og.png` consistent in `index.html`, test, and the `public/og.png` filename; favicon `/favicon.svg` + `/apple-touch-icon.png` link hrefs match the `public/` filenames created in Task 1; size budget `< 300_000` bytes consistent between Task 1 verification and the Task 3 test.
