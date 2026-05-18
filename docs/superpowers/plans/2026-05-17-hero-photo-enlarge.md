# Hero Turing Photo Enlarge/Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the hero Turing photo a large (160 px) centered image stacked above its caption.

**Architecture:** Single-file JSX/Tailwind change in the hero's trailing `Reveal` block — horizontal row → centered vertical stack with a bigger `<img>`.

**Tech Stack:** React/TSX, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-05-17-hero-photo-enlarge-design.md`

**Conventions:** `main` (continuously deployed; user pushes at cycle end). gpg-unsigned commits ending with:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
Web cmds: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web <cmd>`. No deps, no other files.

---

## File Structure

```
apps/web/src/components/landing/hero.tsx   MODIFY  trailing Reveal block: enlarge + center the photo
docs/PROJECT-LOG.md                        MODIFY  shipped entry
```

---

## Task 1: Enlarge & center the hero photo

**Files:** Modify `apps/web/src/components/landing/hero.tsx`

- [ ] **Step 1: Read the file and confirm the exact current block**

Run: `cat apps/web/src/components/landing/hero.tsx`
The trailing reveal is currently exactly (confirm verbatim; if different, STOP + report BLOCKED):
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

- [ ] **Step 2: Replace that block exactly with**

```tsx
        <Reveal delay={240}>
          <div className="mt-8 flex flex-col items-center gap-4">
            <img
              src="/turing.jpg"
              alt="Turing, a blue-merle Mini American Shepherd"
              width={160}
              height={160}
              loading="lazy"
              decoding="async"
              className="size-40 rounded-full object-cover shadow-lg ring-4 ring-copper/40"
            />
            <p className="max-w-sm text-center text-sm text-slate-soft/80">
              Built by dog people — and named after Turing, a blue-merle Mini
              American Shepherd.
            </p>
          </div>
        </Reveal>
```
Nothing else in `hero.tsx` changes (eyebrow/h1/subcopy/gradient/imports untouched). Caption text is byte-identical; only layout + image size change. (`size-40` = 10rem = 160 px, matching `width`/`height`.)

- [ ] **Step 3: Gates**

Run, all must pass:
- `set -a && . ./.env && set +a && pnpm --filter @turingcare/web test` → 6 passing (the existing `getAllByRole("img", { name: /turing/i }).length > 0` still holds — hero `<img>` + alt unchanged).
- `set -a && . ./.env && set +a && pnpm --filter @turingcare/web typecheck` → 0 errors.
- `pnpm lint` → 0 errors (Biome format-only auto-fix via `pnpm format` allowed; do not change the JSX logic/classes/text).
- `set -a && . ./.env && set +a && pnpm --filter @turingcare/web build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/landing/hero.tsx
git -c commit.gpgsign=false commit -m "feat(web): enlarge + center the hero Turing photo" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Controller visual check (out of subagent scope — note in report)**

A subagent can't see the rendered page. Report that the change is committed; the controller will start the dev server (or build preview) and visually confirm the hero shows a large (~160 px) centered circular photo stacked above the caption, brand ring/shadow, no layout breakage. If it looks off (too big/small, crowding the CTA-less hero), the controller will request a size tweak (e.g., `size-36`/`size-44`).

---

## Task 2: PROJECT-LOG + final gate

**Files:** Modify `docs/PROJECT-LOG.md`

- [ ] **Step 1: Full gate (whole-repo)**

```bash
set -a && . ./.env && set +a
pnpm -r exec tsc --noEmit          # exit 0
pnpm -r test                       # shared 3 + api 10 + web 6, all green
pnpm -r build                      # all workspaces build
git status --porcelain ; git diff --stat origin/main -- package.json pnpm-lock.yaml apps/api
```
Expected: all green; clean tree; no `package.json`/`pnpm-lock.yaml`/`apps/api` change in origin/main..HEAD for this tweak (only `apps/web/src/components/landing/hero.tsx` + docs).

- [ ] **Step 2: Append PROJECT-LOG entry**

Add to `docs/PROJECT-LOG.md` (newest at bottom; leave existing sections intact):
```markdown
## 2026-05-17 — Hero photo enlarge/center — SHIPPED
Hero Turing photo enlarged 48px→160px (`size-40`) and re-laid-out as a centered
vertical stack above the caption (ring-4 + shadow). Footer avatar/OG unchanged.
- Spec/plan: `specs/2026-05-17-hero-photo-enlarge-design.md`, `plans/2026-05-17-hero-photo-enlarge.md`
- Commits: this cycle (see `git log`).
```

- [ ] **Step 3: Commit**

```bash
git add docs/PROJECT-LOG.md
git -c commit.gpgsign=false commit -m "docs: PROJECT-LOG entry for hero photo enlarge" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** enlarge to 160 px (`size-40` + width/height 160) → T1 S2; centered vertical stack above caption (`flex flex-col items-center gap-4`, `mt-8`) → T1 S2; `ring-4 ring-copper/40` + `shadow-lg` → T1 S2; caption `max-w-sm text-center` text unchanged → T1 S2; footer/OG/other untouched, no test change (existing img assertion still valid) → T1 S2–S3; gates + scope + PROJECT-LOG → T1 S3 / T2. No gap.

**Placeholder scan:** none — exact before/after JSX, exact commands with expected output, the visual check is explicitly flagged as controller-scope (not a TODO).

**Type/consistency:** `alt`/`src` unchanged so the existing `landing.test.tsx` `getAllByRole("img", { name: /turing/i })` assertion stays valid; `size-40`=160px matches `width={160} height={160}`; only the one trailing `Reveal` block changes — eyebrow/h1/subcopy/imports referenced nowhere else in this plan, consistent with "single-file, one block" scope.
