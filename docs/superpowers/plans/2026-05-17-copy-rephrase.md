# Copy Rephrase ("force-free" → positive framing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all "force-free" / "Train without force" wording on the website with positive-reinforcement / reward-based phrasing, including the share image and meta.

**Architecture:** Static copy edits across 7 landing components + `index.html`, the 2 test files updated red→green to the new strings, and the brand `og.svg` tagline updated + `og.png` regenerated via the same one-off `npx` rasterizer (no dependency). `apps/web` only.

**Tech Stack:** React/TSX copy, Vite, Vitest, transient `npx` SVG rasterizer (resvg; Playwright fallback).

**Spec:** `docs/superpowers/specs/2026-05-17-copy-rephrase-design.md`

**Conventions:** Work on `main` (continuously deployed; user pushes at cycle end). gpg-unsigned commits ending with:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
`git -c commit.gpgsign=false commit -m "<subject>" -m "<trailer>"`. No `package.json`/`pnpm-lock.yaml` changes. Nothing outside `apps/web/*` and `docs/PROJECT-LOG.md` (+ this plan/spec).

Each string edit: the implementer must first `grep`/read the file to confirm the exact "before" substring, then replace with the "after". If a "before" string is not found verbatim, STOP and report (do not guess).

---

## File Structure

```
apps/web/
  src/routes/landing.test.tsx              MODIFY  assertions → new strings (red→green driver)
  src/og-meta.test.ts                      MODIFY  description/og:description asserts → new line
  src/components/landing/hero.tsx          MODIFY  H1 emphasis, eyebrow chip, subcopy
  src/components/landing/philosophy.tsx    MODIFY  H2
  src/components/landing/brief-spotlight.tsx MODIFY one sentence
  src/components/landing/how-it-works.tsx  MODIFY  one STEPS body
  src/components/landing/trainers-teaser.tsx MODIFY heading + one TAGS entry
  src/components/landing/faq.tsx           MODIFY  QA[0].q
  src/components/landing/site-footer.tsx   MODIFY  tagline line
  index.html                               MODIFY  description/og:description/twitter:description/og:image:alt
  assets/og.svg                            MODIFY  tagline text + font-size 44→40
  public/og.png                            REGEN   from updated og.svg (npx, no dep)
docs/PROJECT-LOG.md                        MODIFY  add the shipped-phase entry
```

---

## Task 1: Update tests to the new copy, then rewrite the copy (red→green)

**Files:** Modify `apps/web/src/routes/landing.test.tsx`, `apps/web/src/og-meta.test.ts`, and the 7 landing components + `apps/web/index.html`.

- [ ] **Step 1: Update `apps/web/src/routes/landing.test.tsx` assertions to the new copy**

Replace exactly:
- `screen.getByRole("heading", { name: /train without force/i })` → `screen.getByRole("heading", { name: /train with positive reinforcement/i })`
- `name: /is it really force-free/i,` → `name: /is it really positive reinforcement/i,`
- Leave the `screen.getByText(/reward-based, science-supported/i)` assertion **unchanged** (FAQ answer text is not changing).

- [ ] **Step 2: Update `apps/web/src/og-meta.test.ts` assertions**

Replace both occurrences of the old tagline in the asserted strings:
- `'name="description" content="Understand your dog. Train without force."'` → `'name="description" content="Understand your dog. Train with positive reinforcement."'`
- `'property="og:description" content="Understand your dog. Train without force."'` → `'property="og:description" content="Understand your dog. Train with positive reinforcement."'`
(Do not touch the og:image / og:url / twitter:card / favicon assertions.)

- [ ] **Step 3: Run the web tests — verify they FAIL (red)**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web test`
Expected: `landing.test.tsx` fails (heading + FAQ trigger not found — code still says "force"/"force-free") and `og-meta.test.ts` fails (index.html still has the old description). This proves the assertions are meaningful. Report the failing lines.

- [ ] **Step 4: Apply the copy edits — exact before → after per file**

`apps/web/src/components/landing/hero.tsx`:
- `Force-free · Science-based` → `Positive reinforcement · Science-based`
- `Train without force.` → `Train with positive reinforcement.`
- `your force-free trainer can actually use.` → `your positive-reinforcement trainer can actually use.`

`apps/web/src/components/landing/philosophy.tsx`:
- `Force-free isn't a feature. It's the whole point.` → `Positive reinforcement isn't a feature. It's the whole point.`

`apps/web/src/components/landing/brief-spotlight.tsx`:
- `force-free trainer can act on immediately.` → `reward-based trainer can act on immediately.`

`apps/web/src/components/landing/how-it-works.tsx`:
- `force-free trainer can act on.` → `reward-based trainer can act on.`

`apps/web/src/components/landing/trainers-teaser.tsx`:
- `Find a force-free trainer who fits` → `Find a positive-reinforcement trainer who fits`
- the tag string `"Force-free"` → `"Reward-based"` (in the `TAGS` array; the array already has a `"Positive reinforcement"` entry — do not create a duplicate)

`apps/web/src/components/landing/faq.tsx`:
- `Is it really force-free?` → `Is it really positive reinforcement?` (only the question `q`; the `a` answer string is unchanged)

`apps/web/src/components/landing/site-footer.tsx`:
- `Humane, force-free dog training support.` → `Humane, reward-based dog training support.`

`apps/web/index.html` (4 attribute values):
- `<meta name="description" content="Understand your dog. Train without force." />` → `... content="Understand your dog. Train with positive reinforcement." />`
- `<meta property="og:description" content="Understand your dog. Train without force." />` → `... content="Understand your dog. Train with positive reinforcement." />`
- `<meta name="twitter:description" content="Understand your dog. Train without force." />` → `... content="Understand your dog. Train with positive reinforcement." />`
- `<meta property="og:image:alt" content="TuringCare — humane, force-free dog training" />` → `... content="TuringCare — humane, positive-reinforcement dog training" />`

- [ ] **Step 5: Verify no occurrences remain**

Run: `grep -rniE 'force[- ]free|without force' apps/web/src apps/web/index.html`
Expected: **no output**. If anything remains (e.g., a spot not listed), apply the same positive-framing treatment, note it, and re-grep.

- [ ] **Step 6: Run the web tests — verify they PASS (green)**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web test`
Expected: all pass (use-in-view 2 + landing 2 + og-meta 2 = 6). The `/reward-based, science-supported/i` FAQ-answer assertion still passes (answer unchanged).

- [ ] **Step 7: Typecheck + lint**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web typecheck` → 0 errors.
Run: `pnpm lint` → 0 errors (if Biome flags only formatting on the touched files, `pnpm format` then re-check; copy unchanged).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src apps/web/index.html
git -c commit.gpgsign=false commit -m "feat(web): rephrase force-free → positive-reinforcement/reward-based copy" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Regenerate the OG share image

**Files:** Modify `apps/web/assets/og.svg`; regenerate `apps/web/public/og.png`

- [ ] **Step 1: Update the tagline in `apps/web/assets/og.svg`**

The tagline `<text>` element currently reads (verify exact string first):
`<text x="100" y="540" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="500" fill="#c9d4dd">Understand your dog. Train without force.</text>`
Change **only** that element to:
`<text x="100" y="540" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="500" fill="#c9d4dd">Understand your dog. Train with positive reinforcement.</text>`
(text content + `font-size="44"`→`"40"`; the longer line needs the smaller size to stay within the 1200px canvas. No other SVG element changes — the wordmark/paw/circles/`turingcare.dog` line are untouched.)

- [ ] **Step 2: Regenerate `apps/web/public/og.png`**

Primary (transient, not a dep): `cd apps/web && npx --yes @resvg/resvg-js-cli assets/og.svg public/og.png ; cd -`
Verify: `file apps/web/public/og.png` reports `1200 x 630`; `wc -c < apps/web/public/og.png` is `< 300000`.
If resvg is unavailable or the PNG is suspiciously tiny (< ~6000 bytes ⇒ text didn't render), use the fallback (Chromium has fonts):
```
printf '<!doctype html><meta charset=utf-8><body style="margin:0">%s</body>' "$(cat apps/web/assets/og.svg)" > /tmp/og.html
npx --yes playwright@latest screenshot --browser chromium --viewport-size 1200,630 --full-page=false /tmp/og.html apps/web/public/og.png
```
Re-verify dims/size. Report which path and the byte size.

- [ ] **Step 3: Confirm no dependency added**

Run: `git status --porcelain package.json pnpm-lock.yaml apps/web/package.json`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/web/assets/og.svg apps/web/public/og.png
git -c commit.gpgsign=false commit -m "feat(web): regenerate OG image with positive-reinforcement tagline" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Controller visual check (out of subagent scope — note in report)**

A subagent cannot see the PNG. Report the byte size + `file` dims; the controller will open `apps/web/public/og.png` to confirm the new tagline "Understand your dog. Train with positive reinforcement." is fully visible and not clipped. If clipped, reduce font-size to `38` (or wrap) and regenerate.

---

## Task 3: Full gate + project log

**Files:** Modify `docs/PROJECT-LOG.md`

- [ ] **Step 1: Full verification gate — all must pass**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web test       # 6 passing
pnpm --filter @turingcare/web typecheck  # 0 errors
pnpm lint                                # 0 errors
pnpm --filter @turingcare/web build      # succeeds; then re-grep dist:
grep -rniE 'force[- ]free|without force' apps/web/dist/index.html ; echo "exit=$?"   # no match (exit nonzero from grep = good)
pnpm -r exec tsc --noEmit                # exit 0
pnpm -r build                            # all workspaces build
```
Expected: web tests 6/6; the `grep` on `dist/index.html` finds nothing (the build embeds the new copy); all gates green.

- [ ] **Step 2: Scope / dependency drift check**

```bash
git status --porcelain
git diff --stat origin/main -- package.json pnpm-lock.yaml apps/api
```
Expected: clean tree; no `package.json`/`pnpm-lock.yaml` change; no `apps/api` change (this sub-project is `apps/web` + docs only).

- [ ] **Step 3: Add the PROJECT-LOG entry**

Append to `docs/PROJECT-LOG.md` a new dated section (replace the placeholder "IN DESIGN" copy-rephrase entry at the bottom if present):

```markdown
## 2026-05-17 — Copy rephrase ("force-free" → positive framing) — SHIPPED
Replaced "force-free" / "Train without force" with positive-reinforcement /
reward-based phrasing across the 7 landing components, footer, FAQ, trainers
tag/heading, `index.html` description/og/twitter/og:image:alt, and regenerated
`og.png`. Tests updated red→green.
- Spec/plan: `specs/2026-05-17-copy-rephrase-design.md`, `plans/2026-05-17-copy-rephrase.md`
- Commits: this cycle (see `git log`).
```

- [ ] **Step 4: Commit the log**

```bash
git add docs/PROJECT-LOG.md
git -c commit.gpgsign=false commit -m "docs: PROJECT-LOG entry for copy rephrase" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Post-Implementation (controller, after push)

Record in the final summary: after `deploy-web` ships, re-scrape via the
Facebook Sharing Debugger
(`https://developers.facebook.com/tools/debug/?q=https://turingcare.dog` →
"Scrape Again") so WhatsApp drops the cached old image/description and shows
the new "Train with positive reinforcement." card.

---

## Self-Review

**Spec coverage:** every before→after row in the spec maps to a Task 1 Step-4
edit (hero ×3, philosophy, brief-spotlight, how-it-works, trainers-teaser
heading+tag, faq question, footer, index.html ×4); og.svg tagline+font-size and
og.png regen → Task 2; test updates (landing heading+FAQ trigger, og-meta
description ×2; unchanged answer assertion retained) → Task 1 Steps 1–2; OG
cache re-scrape → Post-Implementation; scope/no-dep guard → Task 3 Step 2;
grep-clean verification → Task 1 Step 5 + Task 3 Step 1; PROJECT-LOG (the
"document all work" preference) → Task 3 Step 3. No spec gap.

**Placeholder scan:** none — exact before/after strings for every edit, exact
commands with expected output, OG fallback is concrete (not a TODO), controller
visual-check step explicitly flagged as out-of-subagent-scope with a remediation
(font-size 38).

**Type/consistency:** the new tagline `Understand your dog. Train with positive
reinforcement.` is byte-identical across hero H1 emphasis, `index.html`
description/og:description/twitter:description, `og.svg`, and the `og-meta.test`
assertions; the FAQ question `Is it really positive reinforcement?` matches the
`landing.test` trigger `/is it really positive reinforcement/i`; the retained
`/reward-based, science-supported/i` matches the unchanged faq.tsx answer; the
`trainers-teaser` tag becomes `"Reward-based"` (no duplicate with the existing
`"Positive reinforcement"` tag), consistent with the spec's note.
