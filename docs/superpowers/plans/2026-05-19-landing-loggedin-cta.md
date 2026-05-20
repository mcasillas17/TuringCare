# Landing logged-in CTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Show a single "Open app" CTA on the landing nav when the user is logged in; keep the existing Log in / Get started pair otherwise.

**Architecture:** Small conditional in `site-nav.tsx` driven by Better Auth's cached `useSession()`, one new i18n key, one focused render test.

**Tech Stack:** React + Better Auth client, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-05-19-landing-loggedin-cta-design.md`

**Conventions:** Worktree `worktree-landing-loggedin-cta`; ships as ONE PR off `origin/main` (do NOT push to/commit on `main`; the open App Shell PR is independent). gpg-unsigned commits ending:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
Web cmds need env: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web <cmd>` from the worktree (copy `/Users/elopenmike/build/Apps/Care/TuringCare/.env` once if missing; gitignored, never commit). `pnpm lint` from repo root. NO `package.json`/`pnpm-lock.yaml` change, no other files. Pre-commit branch assertion: `git branch --show-current` must equal `worktree-landing-loggedin-cta`.

---

## File Structure

```
apps/web/src/i18n/en.ts                              MODIFY  add nav.openApp
apps/web/src/i18n/es.ts                              MODIFY  add nav.openApp (es)
apps/web/src/components/landing/site-nav.tsx         MODIFY  conditional CTA
apps/web/src/components/landing/site-nav.test.tsx    CREATE  logged-in render test
docs/PROJECT-LOG.md                                  MODIFY  shipped entry
```

---

## Task 1: Conditional CTA + i18n + test

**Files:** Modify `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`, `apps/web/src/components/landing/site-nav.tsx`; Create `apps/web/src/components/landing/site-nav.test.tsx`

- [ ] **Step 1: Add `nav.openApp` to `apps/web/src/i18n/en.ts`** — inside the `nav: { … }` section, after `getStarted: "Get started",`:
```ts
    openApp: "Open app",
```

- [ ] **Step 2: Add `nav.openApp` to `apps/web/src/i18n/es.ts`** — same position, Spanish value (must differ from en — the no-untranslated parity test enforces it):
```ts
    openApp: "Abrir app",
```

- [ ] **Step 3: Modify `apps/web/src/components/landing/site-nav.tsx`**

Add the import alongside the existing ones (biome-sorted):
```ts
import { useSession } from "@/lib/auth-client";
```
Inside the `SiteNav()` function body, add (right after `const { t } = useI18n();`):
```ts
  const { data: session } = useSession();
```
Replace the existing right-side action group's two buttons (Log in + Get started) with a single conditional. The current shape is:
```tsx
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Button asChild variant="ghost" className="text-slate hover:bg-surface-sand">
            <Link to="/login">{t("nav.login")}</Link>
          </Button>
          <Button asChild className="bg-slate text-cream hover:bg-slate/90">
            <Link to="/register">{t("nav.getStarted")}</Link>
          </Button>
        </div>
```
Replace it with:
```tsx
        <div className="flex items-center gap-2">
          <LanguageToggle />
          {session ? (
            <Button asChild className="bg-slate text-cream hover:bg-slate/90">
              <Link to="/app">{t("nav.openApp")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="text-slate hover:bg-surface-sand">
                <Link to="/login">{t("nav.login")}</Link>
              </Button>
              <Button asChild className="bg-slate text-cream hover:bg-slate/90">
                <Link to="/register">{t("nav.getStarted")}</Link>
              </Button>
            </>
          )}
        </div>
```
Nothing else changes (LINKS, scroll effect, brand, mobile breakpoints all untouched).

- [ ] **Step 4: Create `apps/web/src/components/landing/site-nav.test.tsx`** (focused logged-in render test using `vi.mock` for the auth client — leaves `landing.test.tsx` undisturbed):
```tsx
import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: { user: { id: "u1", name: "Miguel", email: "m@example.com" } },
    isPending: false,
  }),
  signOut: vi.fn(),
}));

import { SiteNav } from "./site-nav";

describe("SiteNav (logged in)", () => {
  it("renders 'Open app' and hides Log in / Get started when a session exists", () => {
    render(
      <LocaleProvider>
        <MemoryRouter>
          <SiteNav />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(screen.getByRole("link", { name: /open app/i })).toHaveAttribute("href", "/app");
    expect(screen.queryByRole("link", { name: /log in/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /get started/i })).toBeNull();
  });
});
```
The vi.mock is module-scoped to this file → does NOT affect `landing.test.tsx` (which keeps its logged-out assertions). `signOut: vi.fn()` is included in the mock so any consumer that destructures it still gets a function (defensive).

- [ ] **Step 5: Gates**

`set -a && . ./.env && set +a && pnpm --filter @turingcare/web test` → ALL pass (expect the existing landing tests still green for the logged-out path AND the new site-nav test green). Confirm i18n parity test (in the i18n test suite) still green — the `nav.openApp` key exists in both en and es with distinct values.
`set -a && . ./.env && set +a && pnpm --filter @turingcare/web exec tsc --noEmit` → 0 (the `nav.openApp` `MessageKey` resolves; `useSession` return type compatible).
`set -a && . ./.env && set +a && pnpm --filter @turingcare/web build` → succeeds.
`pnpm lint` (repo root) → 0 (run `pnpm format` for format-only/import-order if needed; never change strings/logic).

- [ ] **Step 6: Pre-commit branch assertion + commit (only the 4 files)**
```bash
cd /Users/elopenmike/build/Apps/Care/TuringCare/.claude/worktrees/landing-loggedin-cta
git branch --show-current   # must print: worktree-landing-loggedin-cta
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts apps/web/src/components/landing/site-nav.tsx apps/web/src/components/landing/site-nav.test.tsx
git -c commit.gpgsign=false commit -m "feat(web): landing 'Open app' CTA when logged in" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: PROJECT-LOG + finish as PR

**Files:** Modify `docs/PROJECT-LOG.md`

- [ ] **Step 1: Full repo gate**
```
set -a && . ./.env && set +a
pnpm -r exec tsc --noEmit          # exit 0
pnpm -r test                       # all workspaces green; web suite incl. the new site-nav test
pnpm -r build                      # all workspaces build
pnpm lint                          # 0
git status --porcelain             # clean except untracked .claude/ .env
git diff --stat origin/main -- package.json pnpm-lock.yaml apps/api 'apps/api/fly.toml' 'Dockerfile.api'
```
Expected: all green; the last command EMPTY (this PR is web-only — no api/infra/dep change).

- [ ] **Step 2: Append `docs/PROJECT-LOG.md`** (bottom; match the file's `## YYYY-MM-DD — Title — SHIPPED` heading style; prior entries byte-intact):
```markdown
## 2026-05-19 — Landing logged-in CTA — SHIPPED
Landing `site-nav` shows a single "Open app" button → `/app` when the user is
logged in (Better Auth `useSession`, cached — no extra round-trip); the
existing Log in / Get started pair renders for anonymous visitors. One new
i18n key (`nav.openApp`) in both en + es. Focused `site-nav.test.tsx` covers
the logged-in path via `vi.mock`; landing.test stays green for logged-out.
- Spec/plan: `specs/2026-05-19-landing-loggedin-cta-design.md`, `plans/2026-05-19-landing-loggedin-cta.md`
- Commits: this branch (see `git log`). Shipped as a PR from worktree-landing-loggedin-cta.
```

- [ ] **Step 3: Commit (only `docs/PROJECT-LOG.md`)**
Pre-commit `git branch --show-current` must equal `worktree-landing-loggedin-cta`.
```bash
git add docs/PROJECT-LOG.md
git -c commit.gpgsign=false commit -m "docs: PROJECT-LOG entry for landing logged-in CTA" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: superpowers:finishing-a-development-branch → Push and create a Pull Request** (do NOT merge to main locally; worktree preserved for PR iteration).

---

## Self-Review

**Spec coverage:** conditional CTA → T1 S3; new i18n key in both locales → T1 S1/S2; focused logged-in test → T1 S4; gates + scope (no api/deps) → T1 S5 / T2 S1; PROJECT-LOG + PR → T2. No gap.

**Placeholder scan:** none — exact before/after JSX, exact i18n strings, exact commands. The `isPending` flash is explicitly accepted per the spec's flagged decision; not a placeholder.

**Type/consistency:** `useSession` is imported from `@/lib/auth-client` (the export already exists). The `nav.openApp` key is added to both en and es BEFORE the consumer uses `t("nav.openApp")`, so `MessageKey` typing resolves — tsc 0 enforces it. The Spanish value "Abrir app" differs from en "Open app", so the no-untranslated parity assertion passes without allowlist changes. Only 4 functional/test files + the docs/PROJECT-LOG entry change; nothing else.
