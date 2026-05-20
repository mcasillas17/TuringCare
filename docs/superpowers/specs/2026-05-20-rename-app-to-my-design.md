# TuringCare — Rename authenticated route prefix `/app` → `/my`

**Date:** 2026-05-20
**Status:** Approved (user picked `/my` as the prefix; "concise possessive — routes
read as /my/dogs, /my/journal, /my/brief"). Ready for plan.
**Scope:** Frontend only (`apps/web`). Mechanical, project-wide search-and-replace
of the route prefix `/app` → `/my` across route mounts, in-app navigation, the
AppShell nav config + active-route check, the landing CTA, post-login/register
navigation, and matching test fixtures. No backend, no i18n strings, no API, no
deps.

## Goal

Replace every authenticated route reference from `/app[/…]` to `/my[/…]` —
`/app` (Overview) → `/my`; `/app/dogs` → `/my/dogs`; `/app/journal` → `/my/journal`;
`/app/brief` → `/my/brief`; `/app/dogs/:id/brief` → `/my/dogs/:id/brief`;
`/app/trainers[/…]` → `/my/trainers[/…]`; `/app/profile` → `/my/profile`;
`/app/settings` → `/my/settings`. `/admin` and `/login`/`/register`/`/` stay
exactly as they are.

## What changes (full file inventory from `grep -rnE '"(/app)(/|"|$)|`(/app)(/|`|$)' apps/web/src`)

### Source (13 files):

- `apps/web/src/main.tsx` — 12 `<Route path="/app…">` mounts
- `apps/web/src/components/app-shell/nav-items.ts` — 7 `to: "/app…"`
- `apps/web/src/components/app-shell/AppShell.tsx` — 2: `end={i.to === "/app"}` (NavLink-active check) + `<Link to="/app">` (brand mark)
- `apps/web/src/components/landing/site-nav.tsx` — 1: `<Link to="/app">` (the "Open app" CTA)
- `apps/web/src/routes/login.tsx` — 1: `navigate("/app")` on success
- `apps/web/src/routes/register.tsx` — 1: `navigate("/app")` on success
- `apps/web/src/routes/settings.tsx` — 1: `<Link to="/app/profile">`
- `apps/web/src/routes/overview.tsx` — 6 `to=…` (dogs cards, quick actions)
- `apps/web/src/routes/dogs-list.tsx` — 2 (Link to detail, navigate to new)
- `apps/web/src/routes/dog-form.tsx` — 2 (post-save navigate, Cancel navigate)
- `apps/web/src/routes/dog-detail.tsx` — 3 (back Link, edit Link, post-delete navigate)
- `apps/web/src/routes/trainer-detail.tsx` — 1 (back Link)
- `apps/web/src/routes/trainers.tsx` — 1 (Link to detail)
- `apps/web/src/routes/admin/require-admin.tsx` — 1 (`<Navigate to="/app" replace />` non-admin redirect)

### Tests (6 files):

- `apps/web/src/components/app-shell/AppShell.test.tsx` — `MemoryRouter initialEntries={["/app"]}` + `<Route path="/app" …>`
- `apps/web/src/lib/track.test.tsx` — multiple `initialEntries`/`<Route path>` + 2 assertions on `props.path === "/app"` / `paths.toContain("/app")`
- `apps/web/src/routes/trainers.test.tsx` — `initialEntries` + Route path
- `apps/web/src/routes/brief.test.tsx` — `initialEntries={["/app/dogs/d1/brief"]}` + `<Route path="/app/dogs/:id/brief">`
- `apps/web/src/routes/dogs.test.tsx` — 3 routes (`/app`, `/app/dogs/d1`, `/app/dogs/d1/edit`)
- `apps/web/src/routes/admin/require-admin.test.tsx` — `<Route path="/app" …>` (the redirect target)

### Out of inventory (intentionally NOT touched)

- API: zero references — the route prefix is a frontend concern (no server-side redirect).
- i18n catalogs: no strings reference `/app` literally.
- env / fly / CORS / cookie domain: unaffected — the prefix is a client-routing detail.
- The landing's `/`, marketing nav, `/login`, `/register`, `/admin` and the
  /admin RequireAdmin redirect path destination (which becomes `/my`).
- The polish-resweep PR (separate, still open) is disjoint at the file/line
  level — touches `AppShell.tsx` only at line 127 (aria-label) and brief.tsx
  toast keys; no rename overlap.

## Approved change

Substitute the bare string `/app` (only when it's a route literal — i.e.
inside `"…"` or `` `…` ``) with `/my` across all the files above. The
substitution is regex-precise to avoid touching unrelated occurrences (e.g.
test placeholder text `<div>app</div>`, comments containing "the app",
"/api/auth/", etc.).

Specifically, two sed passes:

```
s|"/app|"/my|g     # all "/app…" string literals
s|`/app|`/my|g     # all `/app${…}…` template literals
```

Plus one targeted edit for the `NavLink` active-route check (also a string
literal — same replacement covers it).

No file outside the inventory above is modified. No keys/i18n/strings of UI
copy are changed. No deps, no schema, no backend, no infra.

## Testing / verification

The existing test suite covers every relevant path. After rename:
- `apps/web` web tests: still 44 across 17 files, all green.
- `apps/web exec tsc --noEmit` 0 (TS is unaffected — no types reference the
  string).
- `pnpm lint` 0.
- `pnpm --filter @turingcare/web build` succeeds.

Verification grep: post-rename, `grep -rnE '"(/app)(/|"|$)|`(/app)(/|`|$)' apps/web/src`
returns NO results (zero `/app` route references remain). The substitution is
total.

## Old-prefix redirect

**Not added.** The beta has effectively one user (you) with no live bookmarks
of `/app/*` URLs that would 404 post-deploy. Adding `<Route path="/app/*">` →
`<Navigate to="/my…">` would add code permanently for a one-time concern. If
desired later, a single catch-all redirect is a 3-line follow-up.

## Out of scope

The polish-resweep PR is independent (toast keys + aria-label localization).
Any future renames (e.g. nested sections under `/my`). API/CORS/cookie
domain. Marketing pages. The `/admin` route. URL behavior for direct visits
to `/app/...` post-merge (no redirect by design — see above).

## Flagged decisions (reasonable; reviewable)

- **No `/app/* → /my/*` 301/Navigate redirect** in this PR (rationale above).
  Trivial to add later if any external bookmarks appear.
- **Mechanical sed-style substitution** with a tight regex (`"/app` and
  `` `/app `` only). Hand-verified by a post-replace grep that no `/app` route
  literal remains. Faster + lower-risk than per-file hand edits, given the
  string is unambiguously a route literal in every audited site.
- **No new tests** — the existing tests' route fixtures are updated in place;
  they continue to assert the same behaviors against the new prefix.
