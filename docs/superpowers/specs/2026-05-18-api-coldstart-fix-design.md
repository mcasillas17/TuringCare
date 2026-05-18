# TuringCare — API cold-start / 502 fix (hotfix)

**Date:** 2026-05-18
**Status:** Approved (user reported the production symptom, I diagnosed it from the
Fly logs, presented the fix, and the user chose the dedicated-hotfix-PR delivery
— approving this approach). Ready for plan.
**Scope:** two files — `apps/api/fly.toml`, `apps/api/src/index.ts`. Separate
from sub-project C (Dog Profile CRUD). Ships as its own PR from the
`worktree-fix-api-coldstart` worktree.

## Problem

`turingcare-api` on Fly returns 502s. From the machine logs:

- Earlier red herring: the Fly **trial** stopped every machine after 5 minutes
  (`Trial machine stopping… add a credit card`). The user added a payment
  method; that cause is resolved.
- Remaining real cause: `fly.toml` has `auto_stop_machines = 'stop'` +
  `min_machines_running = 0`, so the machine **stops when idle and cold-starts
  on the next request**. Cold start runs `pnpm exec tsx src/index.ts`, which
  transpiles the TypeScript app at boot (~6 s to "api listening"). Fly's proxy
  retries only ~8 s / 15 attempts then gives up →
  `[PC01] instance refused connection` / `[PM05] failed to connect to machine`
  → **502**, especially with multiple machines flapping.
- Not a hard bind bug: `@hono/node-server@1.19.14` `serve()` is called with no
  `hostname`, so Node binds all interfaces (`::`/`0.0.0.0`) and single-machine
  starts *did* reach `machine became reachable`. But the code logs a misleading
  `http://localhost:…` string, and an explicit bind removes all ambiguity with
  Fly's `0.0.0.0` expectation.

## Approved change

1. **`apps/api/fly.toml`** — `min_machines_running = 0` → `min_machines_running
   = 1`. Keeps one machine always warm, so there is no cold start on the
   request path → eliminates the cold-start 502s. Affordable now that billing
   is configured. `auto_stop_machines` / `auto_start_machines` unchanged (Fly
   keeps at least the `min`; extra machines may still autoscale/stop).
2. **`apps/api/src/index.ts`** — pass `hostname: "0.0.0.0"` to `serve()` and
   change the log to `http://0.0.0.0:${info.port}`. Defensive: removes any
   IPv6/loopback ambiguity for Fly's proxy and stops the log from being
   misleading. Behaviorally a no-op where Node already bound all interfaces;
   strictly safer.

No other change. No new dependency. No DB/schema/migration. The slow `tsx`
runtime boot itself is **out of scope** (a precompile change would be larger and
is unnecessary once a machine stays warm).

## Testing / verification

`apps/api` has no test asserting the listen host (the existing app/rate-limit
tests use in-memory `app.request()` and are unaffected). No new test — the
change is deploy-config + a defensive bind constant; correctness is verified by
the gate and, post-merge, by the Fly machine staying reachable. Gates:
`pnpm -r exec tsc --noEmit` 0, `pnpm -r test` all green (shared + api + web),
`pnpm -r build` all workspaces, `pnpm lint` 0. No `package.json`/`pnpm-lock`
change.

## Out of scope

Replacing `tsx` runtime transpile with a precompiled build; Dockerfile changes;
`auto_stop_machines` policy redesign; web/Cloudflare; sub-project C; anything
else in `apps/api`.

## Flagged decisions (reasonable; reviewable)

- `min_machines_running = 1` trades a small always-on cost for zero cold-start
  502s — the user explicitly accepted this when choosing the hotfix.
- Explicit `0.0.0.0` bind is defensive, not strictly required, but removes a
  whole class of Fly "is it on 0.0.0.0?" ambiguity and fixes the misleading log.
