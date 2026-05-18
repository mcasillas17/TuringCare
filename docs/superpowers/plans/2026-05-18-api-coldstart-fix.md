# API cold-start / 502 fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Stop the production 502s by keeping one Fly machine warm and binding the API explicitly to `0.0.0.0`.

**Architecture:** Two-line config/code change: `fly.toml min_machines_running 0→1`; `serve()` gets `hostname:"0.0.0.0"` + corrected log.

**Tech Stack:** Fly.io machines config, `@hono/node-server`.

**Spec:** `docs/superpowers/specs/2026-05-18-api-coldstart-fix-design.md`

**Conventions:** Worktree `worktree-fix-api-coldstart`; ships as ONE PR (do NOT push to/commit on `main`). gpg-unsigned commits ending:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
Cmds need env: prefix `set -a && . ./.env && set +a && <cmd>`; `pnpm lint` from repo root. No deps, no other files.

---

## File Structure

```
apps/api/src/index.ts   MODIFY  serve() hostname:"0.0.0.0" + log fix
apps/api/fly.toml       MODIFY  min_machines_running 0 → 1
docs/PROJECT-LOG.md     MODIFY  shipped entry
```

---

## Task 1: Bind 0.0.0.0 + keep one machine warm

**Files:** Modify `apps/api/src/index.ts`, `apps/api/fly.toml`

- [ ] **Step 1: Confirm current `apps/api/src/index.ts` is exactly**
```ts
import { serve } from "@hono/node-server";
import { app } from "./app";
import { env } from "./env";

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`);
});
```
If different, STOP + report BLOCKED.

- [ ] **Step 2: Replace the `serve(...)` call with**
```ts
serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`api listening on http://0.0.0.0:${info.port}`);
});
```
Imports unchanged. Only the `serve()` options object gains `hostname: "0.0.0.0"` and the log string `localhost`→`0.0.0.0`.

- [ ] **Step 3: In `apps/api/fly.toml`, change the single line**
`  min_machines_running = 0` → `  min_machines_running = 1`
(inside `[http_service]`; keep indentation/comments; change nothing else — `auto_stop_machines='stop'`, `auto_start_machines=true`, `internal_port=3001`, `[[vm]]` all unchanged).

- [ ] **Step 4: Gates**
```
set -a && . ./.env && set +a
pnpm -r exec tsc --noEmit          # 0
pnpm -r test                       # shared + api + web all green (unchanged behavior)
pnpm -r build                      # all workspaces
pnpm lint                          # 0
git status --porcelain             # only the 2 files (+ docs in Task 2); untracked .claude/ ok
git diff --stat origin/main -- package.json pnpm-lock.yaml   # EMPTY
```
`@hono/node-server` `serve()` accepts `hostname` (it is passed straight to `server.listen(port, hostname, cb)`), so tsc/build stay green. The api unit tests use in-memory `app.request()` and are unaffected by the listen host.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/index.ts apps/api/fly.toml
git -c commit.gpgsign=false commit -m "fix(api): bind 0.0.0.0 + keep one Fly machine warm (stop cold-start 502s)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: PROJECT-LOG + finish as PR

**Files:** Modify `docs/PROJECT-LOG.md`

- [ ] **Step 1: Append to `docs/PROJECT-LOG.md`** (bottom; match the file's `## YYYY-MM-DD — Title — SHIPPED` style; prior entries byte-intact):
```markdown
## 2026-05-18 — API cold-start / 502 fix — SHIPPED
Fly `min_machines_running` 0→1 (keep one machine warm — no cold-start race) and
explicit `serve({ hostname: "0.0.0.0" })` + corrected log. Root cause: scale-to-
zero + slow `tsx` boot exceeding Fly proxy patience → 502 (the earlier trial
5-min cap was a separate, now-resolved cause). No deps, no schema, apps/api only.
- Spec/plan: `specs/2026-05-18-api-coldstart-fix-design.md`, `plans/2026-05-18-api-coldstart-fix.md`
- Commits: this branch (see `git log`). Shipped as a PR from worktree-fix-api-coldstart.
```

- [ ] **Step 2: Commit**
```bash
git add docs/PROJECT-LOG.md
git -c commit.gpgsign=false commit -m "docs: PROJECT-LOG entry for API cold-start fix" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 3: superpowers:finishing-a-development-branch → Push and create a Pull Request** (do NOT merge to main locally; worktree preserved for PR iteration).

---

## Self-Review

**Spec coverage:** explicit `0.0.0.0` bind + log fix → T1 S2; `min_machines_running 1` → T1 S3; gates + scope (no deps/other files) → T1 S4 / T2; PROJECT-LOG + PR → T2. No gap.

**Placeholder scan:** none — exact before/after for both lines, exact commands, expected outputs.

**Type/consistency:** `serve` is `@hono/node-server`'s `serve({ fetch, port, hostname? }, cb)` — `hostname` is an accepted option forwarded to `server.listen`; no type/signature drift. `fly.toml` change is one scalar; no other key referenced. Only the 3 listed files change; no `package.json`/`pnpm-lock`.
