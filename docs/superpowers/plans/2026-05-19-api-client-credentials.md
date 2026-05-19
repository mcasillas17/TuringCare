# API client cross-origin credentials fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Make the hono API client send cookies on cross-origin requests so authenticated `/api/*` calls work in production.

**Architecture:** One-line change: pass `init: { credentials: "include" }` to `hc<AppType>(...)`.

**Tech Stack:** `hono/client` (`hc`), Vite/React.

**Spec:** `docs/superpowers/specs/2026-05-19-api-client-credentials-design.md`

**Conventions:** Worktree `worktree-fix-api-credentials`; ships as ONE PR (do NOT push to/commit on `main`). gpg-unsigned commits ending:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
Web cmds need env: prefix `set -a && . ./.env && set +a && pnpm --filter @turingcare/web <cmd>`; `pnpm lint` from repo root. No deps, no other files.

---

## File Structure

```
apps/web/src/lib/api.ts   MODIFY  hc(...) gains init:{credentials:"include"}
docs/PROJECT-LOG.md       MODIFY  shipped entry
```

---

## Task 1: Send credentials on API requests

**Files:** Modify `apps/web/src/lib/api.ts`

- [ ] **Step 1: Confirm `apps/web/src/lib/api.ts` is exactly**
```ts
import type { AppType } from "@turingcare/api";
import { hc } from "hono/client";

// Dev: VITE_API_URL is unset → "/" so the Vite proxy forwards /health, /me,
// /api/* to the local API. Prod: VITE_API_URL=https://api.turingcare.dog
// (inlined at build time) so the deployed frontend calls the API subdomain.
export const api = hc<AppType>(import.meta.env.VITE_API_URL || "/");
```
If different, STOP + report BLOCKED.

- [ ] **Step 2: Replace the `export const api = …` line with**
```ts
export const api = hc<AppType>(import.meta.env.VITE_API_URL || "/", {
  init: { credentials: "include" },
});
```
Imports and the comment unchanged. Only the `hc(...)` call gains the second argument.

- [ ] **Step 3: Gates**
```
set -a && . ./.env && set +a
pnpm --filter @turingcare/web exec tsc --noEmit   # 0 (init:RequestInit typechecks against hono/client)
pnpm -r test                                      # shared + api + web all green (fetch is stubbed in web tests; unaffected)
pnpm -r build                                     # all workspaces
pnpm lint                                         # 0
git status --porcelain                            # only apps/web/src/lib/api.ts (+ docs in Task 2); untracked .claude/ .env ok
git diff --stat origin/main -- package.json pnpm-lock.yaml   # EMPTY
```
Run `pnpm -r test` a SECOND time (api integration suite idempotent — no shared-DB leakage).

- [ ] **Step 4: Commit**
```bash
git add apps/web/src/lib/api.ts
git -c commit.gpgsign=false commit -m "fix(web): send credentials on cross-origin API requests (prod 401 fix)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: PROJECT-LOG + finish as PR

**Files:** Modify `docs/PROJECT-LOG.md`

- [ ] **Step 1: Append to `docs/PROJECT-LOG.md`** (bottom; match the file's `## YYYY-MM-DD — Title — SHIPPED` style; prior entries byte-intact):
```markdown
## 2026-05-19 — API client cross-origin credentials fix — SHIPPED
`apps/web/src/lib/api.ts` hono client now sends `credentials: "include"`, so the
session cookie is attached on cross-origin (`turingcare.dog` → `api.turingcare.dog`)
calls. Root cause of the prod 401 on `/api/dogs` (CORS/COOKIE_DOMAIN were already
correct; the client just wasn't sending the cookie). Dev unaffected (same-origin
via Vite proxy). One-line change, no deps.
- Spec/plan: `specs/2026-05-19-api-client-credentials-design.md`, `plans/2026-05-19-api-client-credentials.md`
- Commits: this branch (see `git log`). Shipped as a PR from worktree-fix-api-credentials.
```

- [ ] **Step 2: Commit**
```bash
git add docs/PROJECT-LOG.md
git -c commit.gpgsign=false commit -m "docs: PROJECT-LOG entry for API client credentials fix" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: superpowers:finishing-a-development-branch → Push and create a Pull Request** (do NOT merge to main locally; worktree preserved).

---

## Self-Review

**Spec coverage:** `init:{credentials:"include"}` on `hc` → T1 S2; gates incl. tsc proving the option typechecks → T1 S3; scope (no deps/other files) → T1/T2; PROJECT-LOG + PR → T2. No gap.

**Placeholder scan:** none — exact before/after, exact commands + expected output.

**Type/consistency:** `hc<AppType>(baseUrl, options)` — `options.init` is `RequestInit`; `credentials: "include"` is a valid `RequestInit` member; matches `hono/client` typings (tsc gate proves it). Only `apps/web/src/lib/api.ts` (+ PROJECT-LOG) changed; `auth-client.ts` deliberately untouched (Better Auth client already credential-aware). Web tests stub `fetch` so the new `init` is inert there → stay green.
