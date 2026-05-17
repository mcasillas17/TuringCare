# Landing Tweaks (remove in-page CTAs + Turing photo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CTAs only in the sticky top bar (remove all in-page CTAs), and show Turing's real photo (hero + footer) as a small, optimized, fully metadata-stripped image.

**Architecture:** Part 1 is pure deletion/unwiring of landing components + a test guard. Part 2 produces a privacy-safe derivative image via a one-off `npx` (no dependency), gitignoring the GPS-tagged original so it never enters the public repo, then references `/turing.jpg` from hero + footer. `apps/web` only.

**Tech Stack:** React/TSX, Vite, Vitest + Testing Library, transient `npx sharp-cli` for image processing.

**Spec:** `docs/superpowers/specs/2026-05-17-landing-tweaks-design.md`

**Conventions:** `main` (continuously deployed; user pushes at cycle end). gpg-unsigned commits ending with:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
`git -c commit.gpgsign=false commit -m "<subject>" -m "<trailer>"`. Web cmds: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web <cmd>`. No `package.json`/`pnpm-lock.yaml` changes. Nothing outside `apps/web/*`, root `.gitignore`, `docs/PROJECT-LOG.md` (+ this plan/spec). For each string edit, read/grep first to confirm the exact "before"; if not found verbatim, STOP and report BLOCKED.

**Privacy is a hard gate (Part 2):** the GPS-tagged original must never be `git add`-ed; only the scrubbed derivative is committed; the served `public/turing.jpg` must contain zero EXIF/GPS/XMP/IPTC/thumbnail. A task that can't prove this is BLOCKED, not "done".

---

## File Structure

```
apps/web/src/components/landing/hero.tsx        MODIFY  remove CTA buttons+imports; (T3) add photo by caption
apps/web/src/components/landing/cta-band.tsx    DELETE
apps/web/src/components/landing/site-footer.tsx MODIFY  remove /login Link+import; (T3) add avatar
apps/web/src/routes/landing.tsx                 MODIFY  drop CtaBand import + element
apps/web/src/routes/landing.test.tsx            MODIFY  add CtaBand-absent guard; (T3) Turing img assertion
.gitignore                                      MODIFY  ignore apps/web/assets/turing.jpg (GPS original)
apps/web/public/turing.jpg                      REPLACE raw 4MB → scrubbed ~640px derivative (committed)
apps/web/assets/turing.jpg                      (local only, gitignored — never committed)
docs/PROJECT-LOG.md                             MODIFY  shipped entry
```

---

## Task 1: Remove all in-page CTAs (red→green)

**Files:** Modify `hero.tsx`, `site-footer.tsx`, `routes/landing.tsx`, `routes/landing.test.tsx`; delete `cta-band.tsx`.

- [ ] **Step 1: Add the failing guard to `apps/web/src/routes/landing.test.tsx`**

In the `it("renders the key landing sections", ...)` test, add this line after the existing `getAllByRole("link", ...)` assertion (leave that link assertion as-is — SiteNav still provides a "Get started" link):
```ts
  expect(
    screen.queryByRole("heading", { name: /start understanding your dog today/i }),
  ).toBeNull();
```

- [ ] **Step 2: Run web tests — verify RED**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web test landing`
Expected: FAIL — the `CtaBand` still renders the `<h2>Start understanding your dog today</h2>`, so `queryByRole(...).toBeNull()` fails. Report the failing assertion.

- [ ] **Step 3: Delete the CtaBand component**

Run: `git rm apps/web/src/components/landing/cta-band.tsx`

- [ ] **Step 4: Unwire CtaBand from `apps/web/src/routes/landing.tsx`**

Remove the import line `import { CtaBand } from "@/components/landing/cta-band";` and the `<CtaBand />` element. The `<main>` becomes exactly:
```tsx
      <main>
        <Hero />
        <HowItWorks />
        <BriefSpotlight />
        <Philosophy />
        <TrainersTeaser />
        <Faq />
      </main>
```
(Leave `<SiteNav />` above `<main>` and `<SiteFooter />` below it unchanged.)

- [ ] **Step 5: Remove the hero CTA buttons + now-unused imports in `apps/web/src/components/landing/hero.tsx`**

Delete the entire `<Reveal delay={240}>…</Reveal>` block that contains the two `<Button asChild …><Link to="/register">Get started — it's free</Link></Button>` / `<Link to="/login">Log in</Link>` buttons. Then:
- Remove `import { Link } from "react-router-dom";` and `import { Button } from "@/components/ui/button";` (both are now unused in hero — verify with `grep -n "Link\|Button" apps/web/src/components/landing/hero.tsx` that no other usage remains; if any remains, STOP and report).
- Change the trailing Turing caption's reveal from `<Reveal delay={320}>` to `<Reveal delay={240}>` (fills the freed cadence slot; it's the last Reveal).

- [ ] **Step 6: Remove the footer "Log in" link in `apps/web/src/components/landing/site-footer.tsx`**

Delete the line `<Link to="/login" className="hover:text-gold">Log in</Link>` from the footer `<nav>`. Then remove the now-unused `import { Link } from "react-router-dom";` (verify no other `Link` usage remains in the file with `grep -n "Link" apps/web/src/components/landing/site-footer.tsx`; the `<a href="#how|#brief|#faq">` anchors stay). The footer `<nav aria-label="Footer">` keeps the three `#` anchor links only.

- [ ] **Step 7: Run web tests — verify GREEN**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web test`
Expected: all pass (6) — the new CtaBand-absent guard now passes; the existing `/get started|create your free account/i` link assertion still passes via the SiteNav "Get started" link; FAQ/use-in-view/og-meta unaffected.

- [ ] **Step 8: Grep + typecheck + lint**

- `grep -rniE 'cta-band|CtaBand' apps/web/src` → no output.
- `set -a && . ./.env && set +a && pnpm --filter @turingcare/web typecheck` → 0 errors (catches any leftover unused import).
- `pnpm lint` → 0 errors (if Biome flags only formatting on touched files, `pnpm format` then re-check; do not change logic).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/components/landing/hero.tsx apps/web/src/components/landing/site-footer.tsx apps/web/src/routes/landing.tsx apps/web/src/routes/landing.test.tsx apps/web/src/components/landing/cta-band.tsx
git -c commit.gpgsign=false commit -m "feat(web): CTAs only in top bar — remove hero buttons, CtaBand, footer login" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```
(`git add` of the deleted path records the deletion.)

---

## Task 2: Privacy-safe Turing image (hard privacy gate)

**Files:** Modify root `.gitignore`; replace `apps/web/public/turing.jpg` with the scrubbed derivative. The GPS original stays only at `apps/web/assets/turing.jpg` locally (gitignored).

- [ ] **Step 1: Confirm the local originals and that nothing turing is tracked yet**

```bash
file apps/web/assets/turing.jpg ; file apps/web/public/turing.jpg
git ls-files | grep -i turing ; echo "tracked_count_above"
git status --porcelain | grep -i turing
```
Expected: both are `JPEG … Exif … 3072x4080` ~4 MB; `git ls-files | grep turing` prints **nothing** (not yet committed); both show as untracked `??`.

- [ ] **Step 2: Gitignore the GPS original so it can never be committed**

Append to the root `.gitignore` (specific path — `assets/og.svg`/`favicon.svg` must stay tracked):
```
# Owner-provided source photo with EXIF/GPS — never commit; only the
# scrubbed apps/web/public/turing.jpg derivative is committed.
apps/web/assets/turing.jpg
```
Verify: `git check-ignore apps/web/assets/turing.jpg` prints the path (it is now ignored).

- [ ] **Step 3: Produce the scrubbed, resized derivative → `apps/web/public/turing.jpg`**

Use a transient one-off (no dependency added). Primary:
```bash
npx --yes sharp-cli@^5 -i apps/web/assets/turing.jpg -o apps/web/public rotate resize 640 -f jpeg -q 80
```
Notes for the implementer:
- `sharp-cli` writes `apps/web/public/turing.jpg` (same basename), **overwriting** the raw file. `sharp` re-encodes and does **not** retain EXIF/XMP/IPTC/thumbnail unless `--withMetadata` is passed (we do not) → metadata dropped. `rotate` (no angle) auto-orients from EXIF before stripping.
- If the installed `sharp-cli` flag names differ, run `npx --yes sharp-cli --help` and use the equivalent (input, output dir, auto-rotate, resize longest side ≈640, jpeg q≈80). The acceptance gate below is what matters, not exact flags.
- Do NOT touch `apps/web/assets/turing.jpg` (it stays as the local-only gitignored source).

- [ ] **Step 4: PRIVACY GATE — prove zero metadata (must pass or BLOCKED)**

```bash
file apps/web/public/turing.jpg                    # must NOT contain "Exif"/"TIFF"/"GPS"
grep -a -c -m1 -E 'Exif|GPS|GPSLatitude|http://ns.adobe.com/xap' apps/web/public/turing.jpg || true   # expect 0 matches
wc -c < apps/web/public/turing.jpg                 # expect < 120000
```
If `command -v exiftool` exists, additionally run `exiftool apps/web/public/turing.jpg` and confirm no GPS*/EXIF*/XMP*/IPTC/ThumbnailImage tags (only inert basics like ImageWidth/Height/FileType). If `file` still says `Exif`, or any GPS/XMP marker is found, or size ≥120 KB: the strip failed — re-run Step 3 (e.g., add an explicit metadata-strip flag / fallback `npx --yes sharp-cli ... --withMetadata false`) and re-gate. Do not proceed to commit until clean.

- [ ] **Step 5: Stage and prove the COMMITTED blob is clean**

```bash
git add .gitignore apps/web/public/turing.jpg
git status --porcelain | grep -i turing      # expect ONLY ' M'/'A' apps/web/public/turing.jpg ; assets/turing.jpg MUST NOT appear
git show :apps/web/public/turing.jpg | file -                               # must NOT say Exif
git show :apps/web/public/turing.jpg | grep -a -c -m1 -E 'Exif|GPS|xap' || true   # expect 0
```
Expected: only `apps/web/public/turing.jpg` (+ `.gitignore`) staged; `apps/web/assets/turing.jpg` does NOT appear in `git status` (gitignored); the staged blob has no Exif/GPS/XMP. If `assets/turing.jpg` shows as staged/tracked anywhere, STOP (privacy failure) and report BLOCKED.

- [ ] **Step 6: Controller visual check (out of subagent scope — flag in report)**

A subagent can't see the image. Report `file` output (dimensions), byte size, and the metadata-gate results. The controller will open `apps/web/public/turing.jpg` to confirm it's Turing, upright, not distorted, good crop. If wrong orientation/crop, the controller will request a re-run (e.g., adjust `rotate`/resize).

- [ ] **Step 7: Commit**

```bash
git -c commit.gpgsign=false commit -m "feat(web): scrubbed, optimized Turing photo (no EXIF/GPS); gitignore raw original" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Wire the photo into hero + footer (red→green)

**Files:** Modify `hero.tsx`, `site-footer.tsx`, `routes/landing.test.tsx`. Depends on Task 2 (`/turing.jpg` exists, scrubbed).

- [ ] **Step 1: Add the failing image assertion to `apps/web/src/routes/landing.test.tsx`**

In `it("renders the key landing sections", ...)`, append:
```ts
  expect(
    screen.getAllByRole("img", { name: /turing/i }).length,
  ).toBeGreaterThan(0);
```
(`getAllByRole`, not `getByRole` — hero and footer both render a Turing `<img>` with the same `alt`, so a single-match query would throw.)

- [ ] **Step 2: Run — verify RED**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web test landing`
Expected: FAIL — no `<img>` with alt matching `/turing/i` exists yet.

- [ ] **Step 3: Add the hero photo in `apps/web/src/components/landing/hero.tsx`**

The trailing caption (now `<Reveal delay={240}>` from Task 1) currently is:
```tsx
        <Reveal delay={240}>
          <p className="mt-6 text-sm text-slate-soft/80">
            Built by dog people — and named after Turing, a blue-merle Mini
            American Shepherd. 🐾
          </p>
        </Reveal>
```
Replace that `<Reveal …>…</Reveal>` block with (photo + caption in a centered row):
```tsx
        <Reveal delay={240}>
          <div className="mt-6 flex items-center justify-center gap-3">
            <img
              src="/turing.jpg"
              alt="Turing, a blue-merle Mini American Shepherd"
              width={48}
              height={48}
              loading="lazy"
              decoding="async"
              className="size-12 shrink-0 rounded-full object-cover ring-2 ring-copper/40"
            />
            <p className="text-sm text-slate-soft/80">
              Built by dog people — and named after Turing, a blue-merle Mini
              American Shepherd.
            </p>
          </div>
        </Reveal>
```
(The 🐾 emoji is dropped here since the real photo replaces it.)

- [ ] **Step 4: Add the footer avatar in `apps/web/src/components/landing/site-footer.tsx`**

The bottom line currently is:
```tsx
      <p className="mx-auto mt-8 max-w-6xl border-t border-white/10 pt-6 text-center text-xs text-silver/70 md:text-left">
        © {new Date().getFullYear()} TuringCare · Built for Turing 🐾
      </p>
```
Replace it with (small inline avatar; keep it a single centered/left line):
```tsx
      <p className="mx-auto mt-8 flex max-w-6xl items-center justify-center gap-2 border-t border-white/10 pt-6 text-center text-xs text-silver/70 md:justify-start md:text-left">
        <img
          src="/turing.jpg"
          alt="Turing, a blue-merle Mini American Shepherd"
          width={20}
          height={20}
          loading="lazy"
          decoding="async"
          className="size-5 rounded-full object-cover"
        />
        © {new Date().getFullYear()} TuringCare · Built for Turing
      </p>
```

- [ ] **Step 5: Run — verify GREEN**

Run: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web test`
Expected: all pass (6) — the Turing-img assertion now passes (2 imgs), all prior assertions still green.

- [ ] **Step 6: Typecheck + lint + commit**

- `set -a && . ./.env && set +a && pnpm --filter @turingcare/web typecheck` → 0 errors.
- `pnpm lint` → 0 (format-only fixes allowed via `pnpm format`, logic unchanged).
```bash
git add apps/web/src/components/landing/hero.tsx apps/web/src/components/landing/site-footer.tsx apps/web/src/routes/landing.test.tsx
git -c commit.gpgsign=false commit -m "feat(web): show Turing's photo in hero + footer" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Full gate + PROJECT-LOG

**Files:** Modify `docs/PROJECT-LOG.md`.

- [ ] **Step 1: Full verification gate — all green; paste key lines**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web test          # 6 passing
pnpm --filter @turingcare/web typecheck     # 0
pnpm lint                                   # 0
pnpm --filter @turingcare/web build         # succeeds
test -f apps/web/dist/turing.jpg && file apps/web/dist/turing.jpg   # present, NOT Exif
grep -rniE 'cta-band|CtaBand' apps/web/dist/ ; echo "grep_done"     # no CtaBand refs
pnpm -r exec tsc --noEmit                   # exit 0
pnpm -r build                               # all workspaces build
```
Expected: web tests 6/6; `dist/turing.jpg` exists and `file` shows no `Exif`; build clean.

- [ ] **Step 2: Privacy + scope re-confirm**

```bash
git ls-files | grep -i turing                                  # ONLY apps/web/public/turing.jpg
git check-ignore apps/web/assets/turing.jpg                     # prints the path (ignored)
git log -p --all -- apps/web/assets/turing.jpg | head -1 ; echo "history_check"   # NOTHING (never committed)
git status --porcelain
git diff --stat origin/main -- package.json pnpm-lock.yaml apps/api
```
Expected: only `apps/web/public/turing.jpg` tracked for the image; `assets/turing.jpg` ignored and absent from history; clean tree; no `package.json`/`pnpm-lock.yaml`/`apps/api` change. If `apps/web/assets/turing.jpg` appears in `git ls-files` or history → BLOCKED (privacy failure), escalate.

- [ ] **Step 3: Append the PROJECT-LOG entry**

Add to `docs/PROJECT-LOG.md` (newest at bottom):
```markdown
## 2026-05-17 — Landing tweaks (CTAs top-bar-only + Turing photo) — SHIPPED
Removed all in-page CTAs (hero buttons, deleted CtaBand section, footer login
link) — CTAs live only in the sticky SiteNav. Added Turing's real photo to the
hero caption + footer, served as a ~640px, EXIF/GPS/XMP-stripped derivative;
the GPS-tagged original is gitignored and never enters the public repo.
- Spec/plan: `specs/2026-05-17-landing-tweaks-design.md`, `plans/2026-05-17-landing-tweaks.md`
- Commits: this cycle (see `git log`).
```

- [ ] **Step 4: Commit**

```bash
git add docs/PROJECT-LOG.md
git -c commit.gpgsign=false commit -m "docs: PROJECT-LOG entry for landing tweaks" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Post-Implementation (controller, after push)

OG share image/description are unchanged this cycle, so no Facebook
re-scrape is required. (Rate-limiting / prior cycles' deploy notes still apply:
`deploy-api` needs the Fly payment method; `deploy-web` ships the landing
changes regardless.)

---

## Self-Review

**Spec coverage:** remove hero buttons + unused imports + delay shift → T1 S5; delete cta-band.tsx + unwire landing.tsx → T1 S3–S4; footer /login link + import removed → T1 S6; landing.test CtaBand-absent guard (red→green) → T1 S1–S7; gitignore GPS original, never commit it → T2 S2/S5, T4 S2; scrubbed ~640px/q80 derivative replacing raw, no EXIF/GPS/XMP/IPTC/thumbnail with mandatory exiftool/`file`/grep gate incl. staged-blob check → T2 S3–S5; controller visual verify → T2 S6; hero framed photo by caption + footer avatar, alt, lazy, dimensions → T3 S3–S4; landing.test img assertion via getAllByRole (duplicate alt) → T3 S1; no anti-download deterrents (simple `<img>`) → reflected in T3 code; full gate + scope/no-dep + PROJECT-LOG → T4. All spec sections mapped, including the privacy-critical "never commit the GPS original" as an explicit BLOCK condition.

**Placeholder scan:** none — exact before/after blocks, exact commands with expected output, sharp-cli flag-variance handled by an explicit acceptance gate + `--help` instruction (not a TODO), privacy failure is a concrete BLOCK not a vague "handle".

**Type/consistency:** `alt="Turing, a blue-merle Mini American Shepherd"` identical in hero, footer, and the `/turing/i` test matcher; `/turing.jpg` path consistent (served from `public/` → site root) in hero, footer, and the dist check; the removed CtaBand heading string `start understanding your dog today` in the T1 guard matches the actual `cta-band.tsx` `<h2>` being deleted; `getAllByRole` (not `getByRole`) used for the duplicated-alt image and the existing duplicated CTA-link assertion left intact; hero trailing `Reveal` delay 320→240 (T1) is the same block T3 edits (consistent single locus).
