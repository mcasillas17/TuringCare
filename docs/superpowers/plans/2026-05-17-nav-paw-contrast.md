# Nav Paw-Mark Contrast Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the low-contrast 🐾 OS color-emoji in the site-nav brand badge with the lucide `PawPrint` vector icon so it renders cream-on-slate with strong, device-independent contrast.

**Architecture:** Single-file JSX change in `site-nav.tsx` — add a lucide import, swap the emoji text node for `<PawPrint className="size-4" />` inside the existing badge span. Lucide strokes with `currentColor`, so the badge's existing `text-cream` colors the paw.

**Tech Stack:** React/TSX, Tailwind v4, lucide-react@^0.468.0 (already a dependency).

**Spec:** `docs/superpowers/specs/2026-05-17-nav-paw-contrast-design.md`

**Conventions:** `main` (continuously deployed; user pushes at cycle end). gpg-unsigned commits ending with:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
Web cmds: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web <cmd>`. `pnpm lint` from root, no prefix. No deps, no `package.json`/`pnpm-lock.yaml` change, no other files.

---

## File Structure

```
apps/web/src/components/landing/site-nav.tsx   MODIFY  add lucide import; emoji → <PawPrint/>
docs/PROJECT-LOG.md                            MODIFY  shipped entry
```

---

## Task 1: Swap the emoji for the lucide PawPrint icon

**Files:** Modify `apps/web/src/components/landing/site-nav.tsx`

- [ ] **Step 1: Read the file and confirm the exact current badge block**

Run: `cat apps/web/src/components/landing/site-nav.tsx`
The brand badge currently is exactly (confirm verbatim; if different, STOP + report BLOCKED):
```tsx
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-full bg-slate text-cream"
          >
            🐾
          </span>
```
The current import block (top of file) is exactly:
```tsx
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
```
(If the import order/lines differ — e.g. Biome reordered them — keep the file's actual current imports; only ADD the lucide line in the correct Biome-sorted position. Do not reorder existing imports yourself; `pnpm format` handles ordering.)

- [ ] **Step 2: Add the lucide import**

Add this import in its correct Biome-sorted position among the existing imports (alphabetical by module path — `lucide-react` sorts after `@/lib/utils` and before `react`):
```tsx
import { PawPrint } from "lucide-react";
```
Resulting import block:
```tsx
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { PawPrint } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
```
(If `pnpm lint`/`pnpm format` later adjusts ordering, accept its result — do not fight it. The only requirement: the `PawPrint` import exists and the file is Biome-clean.)

- [ ] **Step 3: Replace the emoji child with the icon**

Replace exactly:
```tsx
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-full bg-slate text-cream"
          >
            🐾
          </span>
```
with exactly:
```tsx
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-full bg-slate text-cream"
          >
            <PawPrint className="size-4" />
          </span>
```
Nothing else in `site-nav.tsx` changes — `aria-hidden`, the span's classes, the "TuringCare" wordmark, `LINKS`, `LanguageToggle`, nav links/buttons, scroll effect, and all other markup are byte-unchanged. Only: (a) the added `PawPrint` import, (b) the `🐾` text node → `<PawPrint className="size-4" />`.

- [ ] **Step 4: Gates**

Run, all must pass:
- `set -a && . ./.env && set +a && pnpm --filter @turingcare/web test` → all green (e.g. 16: i18n 9 + landing 3 + use-in-view 2 + og-meta 2). `landing.test.tsx` has no emoji/paw assertion, so `SiteNav` still rendering keeps it green.
- `set -a && . ./.env && set +a && pnpm --filter @turingcare/web typecheck` → 0 errors.
- `pnpm lint` → 0 errors (run `pnpm format` for format-only/import-order auto-fix if needed; do not change the JSX logic/classes/text).
- `set -a && . ./.env && set +a && pnpm --filter @turingcare/web build` → succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/site-nav.tsx
git -c commit.gpgsign=false commit -m "fix(web): replace low-contrast paw emoji with lucide PawPrint in nav" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Controller visual check (out of subagent scope — note in report)**

A subagent can't see the rendered page. Report that the change is committed; the controller will start the dev server (or build preview) and visually confirm the nav badge shows a crisp cream paw on the dark slate circle with strong contrast, correctly sized within the 32 px badge, wordmark/layout intact. If the paw reads too small/large or thin, the controller will request a tweak (`size-4`→`size-5`, or add `strokeWidth={2.25}`), which is a one-line follow-up.

---

## Task 2: PROJECT-LOG + full repo gate

**Files:** Modify `docs/PROJECT-LOG.md`

- [ ] **Step 1: Full gate (whole-repo)**

```bash
set -a && . ./.env && set +a
pnpm -r exec tsc --noEmit          # exit 0
pnpm -r test                       # all workspaces green (shared + api + web)
pnpm -r build                      # all workspaces build
git status --porcelain ; git diff --stat origin/main -- package.json pnpm-lock.yaml apps/api
```
Expected: all green; clean tree (untracked `.claude/` acceptable); NO `package.json`/`pnpm-lock.yaml`/`apps/api` change in origin/main..HEAD attributable to this tweak (only `apps/web/src/components/landing/site-nav.tsx` + docs/spec/plan).

- [ ] **Step 2: Append PROJECT-LOG entry**

Append to `docs/PROJECT-LOG.md` (newest at bottom; leave existing sections intact; match the file's existing `## YYYY-MM-DD — Title — SHIPPED` style):
```markdown
## 2026-05-17 — Nav paw-mark contrast fix — SHIPPED
Replaced the OS 🐾 color-emoji in the site-nav brand badge with the lucide
`PawPrint` vector icon (cream stroke via `currentColor` on the slate badge) —
strong, device-independent contrast. No deps (lucide already present); single
component change.
- Spec/plan: `specs/2026-05-17-nav-paw-contrast-design.md`, `plans/2026-05-17-nav-paw-contrast.md`
- Commits: this cycle (see `git log`).
```

- [ ] **Step 3: Commit**

```bash
git add docs/PROJECT-LOG.md
git -c commit.gpgsign=false commit -m "docs: PROJECT-LOG entry for nav paw-mark contrast fix" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** emoji → lucide `PawPrint` (`<PawPrint className="size-4" />`) → T1 S3; lucide import added in Biome-sorted position, no new dep → T1 S2; badge span/classes/`aria-hidden`/wordmark/all else unchanged → T1 S3; cream-on-slate via existing `text-cream` + `currentColor` (no code needed — inherent to lucide) → satisfied by S3 leaving `text-cream` intact; no new test, existing tests stay green (no paw assertion) → T1 S4; gates + scope + PROJECT-LOG → T1 S4 / T2; controller visual check explicitly flagged as controller-scope → T1 S6. No gap.

**Placeholder scan:** none — exact before/after JSX + import block, exact commands with expected output; the icon-size/strokeWidth tweak is explicitly flagged as a controller-scope visual follow-up, not an in-plan TODO.

**Type/consistency:** `PawPrint` is a confirmed `lucide-react@^0.468.0` export; `import { X } from "lucide-react"` matches the existing pattern in `how-it-works.tsx`; `className` is a valid lucide icon prop (used as `size-4` Tailwind util = 16 px, sensible inside the `size-8`=32 px badge); the badge keeps `text-cream` so `currentColor` resolves to cream — consistent end-to-end; only the one badge block + one import line change, matching the spec's single-file scope.
