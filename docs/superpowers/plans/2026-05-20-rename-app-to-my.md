# Rename `/app` → `/my` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Replace every authenticated route reference from `/app[/…]` to `/my[/…]` across the web app + tests; everything else (`/login`/`/register`/landing `/`/`/admin`) unchanged.

**Architecture:** Mechanical project-wide substitution scoped to two precise regex patterns (`"/app` and `` `/app ``) — catches every route literal in `<Link to=…>`, `<Route path=…>`, `<Navigate to=…>`, `navigate(…)`, `useParams`, `initialEntries=[…]`, and test assertions. Hand-verified by a post-replace grep showing zero remaining `/app` route literals.

**Tech Stack:** React Router v7, vitest, sed.

**Spec:** `docs/superpowers/specs/2026-05-20-rename-app-to-my-design.md`

**Conventions:** Worktree `worktree-rename-app-to-my`; ships as ONE PR off `origin/main`. gpg-unsigned commits ending:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
Web cmds need env: `set -a && . ./.env && set +a && pnpm --filter @turingcare/web <cmd>` from the worktree (`.env` is gitignored — never commit). `pnpm lint` from repo root. NO `package.json`/`pnpm-lock.yaml`/api/i18n change. Pre-commit branch assertion: `git branch --show-current` must equal `worktree-rename-app-to-my`.

---

## File Structure

```
apps/web/src/main.tsx                                       MODIFY  12 route paths
apps/web/src/components/app-shell/nav-items.ts              MODIFY  7 nav items
apps/web/src/components/app-shell/AppShell.tsx              MODIFY  brand Link + active-route check
apps/web/src/components/landing/site-nav.tsx                MODIFY  Open-app CTA Link
apps/web/src/routes/login.tsx                               MODIFY  post-success navigate
apps/web/src/routes/register.tsx                            MODIFY  post-success navigate
apps/web/src/routes/settings.tsx                            MODIFY  Edit-profile Link
apps/web/src/routes/overview.tsx                            MODIFY  6 navigation targets
apps/web/src/routes/dogs-list.tsx                           MODIFY  Link + navigate
apps/web/src/routes/dog-form.tsx                            MODIFY  post-save + Cancel
apps/web/src/routes/dog-detail.tsx                          MODIFY  back/edit/post-delete
apps/web/src/routes/trainer-detail.tsx                      MODIFY  back Link
apps/web/src/routes/trainers.tsx                            MODIFY  detail Link
apps/web/src/routes/admin/require-admin.tsx                 MODIFY  non-admin redirect
apps/web/src/components/app-shell/AppShell.test.tsx         MODIFY  MemoryRouter + Route path
apps/web/src/lib/track.test.tsx                             MODIFY  routes + assertions
apps/web/src/routes/trainers.test.tsx                       MODIFY  MemoryRouter + Route
apps/web/src/routes/brief.test.tsx                          MODIFY  MemoryRouter + Route
apps/web/src/routes/dogs.test.tsx                           MODIFY  3 MemoryRouter + Route blocks
apps/web/src/routes/admin/require-admin.test.tsx            MODIFY  Route path (redirect target)
docs/PROJECT-LOG.md                                         MODIFY  shipped entry
```

---

## Task 1: Project-wide substitution + verification

**Files:** all 20 source/test files listed above (modify in place).

- [ ] **Step 1: Pre-substitution audit**

```bash
cd /Users/elopenmike/build/Apps/Care/TuringCare/.claude/worktrees/rename-app-to-my
grep -rnE '"(/app)(/|"|$)|`(/app)(/|`|\$)' apps/web/src | wc -l
```
Expected: ~50 lines (matches across the 20 files). Record the count for the post-substitution check.

- [ ] **Step 2: Execute the substitution**

```bash
find apps/web/src -type f \( -name "*.ts" -o -name "*.tsx" \) -print0 \
  | xargs -0 sed -i '' -e 's|"/app|"/my|g' -e 's|`/app|`/my|g'
```

This is a BSD-sed-compatible (macOS) two-pattern in-place edit:
- `s|"/app|"/my|g` — replaces every `"/app…"` route literal (handles `"/app"`, `"/app/dogs"`, `"/app/dogs/:id"`, etc.).
- `s|`/app|`/my|g` — replaces template-literal forms like `` `/app/dogs/${id}` ``.

This is intentionally narrow: it only matches `/app` when preceded by `"` or `` ` `` — so unrelated occurrences (e.g. `<div>app</div>` placeholder text, comments containing "the app", `import` paths like `@/lib/api`, anything containing `/api/`) are NEVER touched.

- [ ] **Step 3: Post-substitution audit — MUST be zero**

```bash
grep -rnE '"(/app)(/|"|$)|`(/app)(/|`|\$)' apps/web/src
```
Expected: **no output** (zero remaining `/app` route literals). If anything remains, inspect each match and fix by hand — DO NOT widen the sed (that risks false positives).

- [ ] **Step 4: Spot-check the substitution didn't damage anything**

```bash
# All these were route literals — should now be /my
grep -nE '"/my(/|")' apps/web/src/main.tsx
grep -nE '"/my' apps/web/src/components/app-shell/nav-items.ts
grep -nE '"/my' apps/web/src/components/app-shell/AppShell.tsx
grep -nE '"/my' apps/web/src/routes/login.tsx apps/web/src/routes/register.tsx
grep -nE '"/my' apps/web/src/routes/admin/require-admin.tsx
grep -nE '/my' apps/web/src/routes/overview.tsx
```
Confirm: main.tsx has 12 routes at `/my…`; nav-items has 7 entries `/my…`; AppShell has `<Link to="/my">` and `end={i.to === "/my"}`; login/register have `navigate("/my")`; require-admin redirects to `/my`; overview has its 6 nav targets at `/my…`.

- [ ] **Step 5: Gates (all must pass)**

```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web exec tsc --noEmit            # 0
pnpm --filter @turingcare/web test                         # 44 across 17 files, all green
pnpm --filter @turingcare/web build                        # succeeds
pnpm lint                                                   # 0
```
The test count is preserved because we only changed string fixtures — no test was added or removed. `tsc --noEmit` proves no broken imports/types (the rename touched string literals only).

- [ ] **Step 6: Commit (pre-commit branch assertion!)**

```bash
git branch --show-current        # must print: worktree-rename-app-to-my
git add apps/web/src
git -c commit.gpgsign=false commit -m "feat(web): rename authenticated route prefix /app → /my" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: PROJECT-LOG + finish as PR

**Files:** Modify `docs/PROJECT-LOG.md`

- [ ] **Step 1: Full repo gate (sanity)**
```
set -a && . ./.env && set +a
pnpm -r exec tsc --noEmit          # 0
pnpm -r test                       # all workspaces green
pnpm -r build                      # all workspaces
pnpm lint                          # 0
git status --porcelain             # clean except untracked .claude/ .env
git diff --stat origin/main -- package.json pnpm-lock.yaml apps/api apps/web/src/i18n
```
Expected: all green; the last command EMPTY (web-only string-literal rename — no api/deps/i18n change).

- [ ] **Step 2: Append `docs/PROJECT-LOG.md`** (bottom; match the file's heading style; prior entries byte-intact):
```markdown
## 2026-05-20 — Authenticated route prefix /app → /my — SHIPPED
Mechanical rename of every authenticated route literal across the web app +
tests (~20 files): `/app` → `/my`, `/app/dogs` → `/my/dogs`, etc. AppShell
nav-items, NavLink active check, brand `<Link to>`, landing CTA, post-
login/register navigation, and every in-app `<Link>`/`navigate(…)`/test
fixture re-targeted in one pass. No backend, no i18n strings, no deps, no
infra; `/login`/`/register`/`/`/`/admin` untouched. Tests pass at the same
44/17 totals (string fixtures updated in place).
- Spec/plan: `specs/2026-05-20-rename-app-to-my-design.md`, `plans/2026-05-20-rename-app-to-my.md`
- Commits: this branch (see `git log`). Shipped as a PR from worktree-rename-app-to-my.
```

- [ ] **Step 3: Commit (only docs/PROJECT-LOG.md)**

Pre-commit `git branch --show-current` must equal `worktree-rename-app-to-my`.
```bash
git add docs/PROJECT-LOG.md
git -c commit.gpgsign=false commit -m "docs: PROJECT-LOG entry for /app → /my rename" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: superpowers:finishing-a-development-branch → Push and create a Pull Request** (do NOT merge to main locally; worktree preserved for PR iteration).

---

## Self-Review

**Spec coverage:** rename of every audited `/app` literal → T1 (sed + post-audit) ; nav-items + AppShell active-check + brand Link → T1 by virtue of the regex matching them ; landing CTA → T1 ; post-login/register navigation → T1 ; admin RequireAdmin redirect → T1 ; tests' MemoryRouter + Route + assertions → T1 ; gates + scope (no api/deps/i18n) → T1 S5 / T2 S1 ; PROJECT-LOG + PR → T2. No gap.

**Placeholder scan:** none — exact `sed` patterns, exact `grep` audit commands with explicit "MUST be zero" assertion, exact spot-check commands. The "if anything remains, fix by hand — DO NOT widen the sed" instruction is bounded guidance, not a TODO.

**Type/consistency:** the rename only affects string literals — TypeScript types are untouched, so the existing `MessageKey`/route inference holds. The regex doesn't match `/api/...` (preceded by `"/` so it matches `"/app` but `"/api` starts with `"/a` followed by `pi` — no match for the `/app` literal there because we anchor on `"/app` exactly, not `"/a`). Same for `import` paths (`@/components/...` — no leading `"/` form). The post-substitution grep is the final guarantee.
