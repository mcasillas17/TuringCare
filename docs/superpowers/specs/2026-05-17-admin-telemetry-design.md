# Admin Portal & Usage Telemetry — Design Spec

**Date:** 2026-05-17
**Status:** Approved (brainstorming)
**Topic:** Self-hosted, first-party product/usage telemetry with an `/admin` dashboard

---

## 1. Goal & context

Build the telemetry foundation now so it captures product-usage data as
features ship, plus an `/admin` dashboard the operator uses to see how users
interact with TuringCare.

**Repo state at design time:** Only auth + marketing landing + i18n + an `/app`
shell are shipped. The Drizzle domain schema (`dogs`, `journal_entries`,
`briefs`, `trainers`, …) exists but the API exposes **no CRUD endpoints** for
it yet (`/health`, `/me`, validation, Better Auth handler only). There is **no
`role`/admin concept** on the `user` table and **no telemetry of any kind**.

Implication: there is little usage to measure today (signups, logins,
sessions). This project is primarily **instrumentation groundwork** plus the
dashboard to read it — analytical value grows as product features land and call
the capture helper.

### Decisions locked during brainstorming

| Decision | Choice |
|---|---|
| Primary goal | Product/usage telemetry |
| Telemetry stack | Self-hosted, first-party (own Postgres + custom React dashboard); no third-party analytics, no external script |
| Admin access | `user.role` enum + `ADMIN_EMAILS` env bootstrap with self-healing lazy promotion |
| v1 dashboard views | Growth & users; Active usage (DAU/WAU/MAU); Event explorer + feature funnel; Live activity feed |
| Event privacy | Minimal records, no free-text/PII in props, retention cap (default 365 days, auto-purge) |
| Dashboard layout | A — single scrolling dashboard (KPI strip + stacked panels) |

---

## 2. Architecture & data model

### 2.1 New table: `events` (migration `0002`)

| column | type | notes |
|---|---|---|
| `id` | `uuid` pk, `gen_random_uuid()` | |
| `userId` | `text` → `user.id`, **nullable**, `onDelete: set null` | nullable for pre-auth events; set-null preserves aggregates if a user is deleted |
| `name` | `text` not null | event key, e.g. `user.signed_up`, `user.signed_in`, `dog.created`, `journal.entry_created`, `brief.generated`, `page.viewed` |
| `props` | `jsonb` not null default `'{}'` | typed; **enums/ids/counts only — never free text or PII** |
| `sessionId` | `text` → `session.id`, nullable, `onDelete: set null` | ties events to a session for DAU without storing IP in events |
| `createdAt` | `timestamptz` not null default now | |

**Indexes:** `(name, createdAt)` and `(createdAt)` — support time-series,
funnel, and retention-purge queries.

### 2.2 `user.role` (same migration)

- New `pgEnum` `user_role` = `('user','admin')`.
- `role` column on `user`: not null, default `'user'`.

### 2.3 Capture paths

**Server-side (authoritative).** A thin helper:

```
recordEvent(name, { userId?, sessionId?, props? }): Promise<void>
```

- Lives in the API (`apps/api/src`), inserts one `events` row.
- **Non-blocking:** all work wrapped; on failure it logs and returns — it
  never throws into the caller's request path. A broken events table cannot
  break signup or any user flow.
- Wired into the Better Auth lifecycle now for `user.signed_up` and
  `user.signed_in` (via Better Auth hooks/callbacks). Every future feature
  endpoint (dog CRUD, journal, briefs, trainer search) calls `recordEvent`.

**Client-side (page views).** A tiny `track(name, props?)` in `apps/web`
POSTs to a new `POST /api/events`:

- Endpoint is rate-limited (reuses the existing in-memory global limiter),
  validates `name` against a **server-side allowlist** of permitted event
  names, validates `props` against a Zod schema, and attaches `userId` /
  `sessionId` from the Better Auth cookie server-side (client cannot spoof
  identity).
- v1 emits `page.viewed` (props: `{ path }`, path normalized to route
  pattern, no query string) on React Router route change. No third-party
  script, no external network call.

### 2.4 Admin auth

`requireAdmin` middleware (API):

1. Resolve Better Auth session; no session → `401`.
2. Admin if `user.role === 'admin'` **OR** `user.email ∈ ADMIN_EMAILS`
   (comma-separated env list, normalized lower-case/trim).
3. **Self-healing bootstrap:** on any authenticated request, if
   `email ∈ ADMIN_EMAILS` and `role !== 'admin'`, lazily `UPDATE` the row to
   `admin`. No manual SQL; operator is never locked out.
4. Non-admin authenticated request to `/api/admin/*` → `403` (not 404).

Web: `/admin` route guards on `GET /me` returning `role === 'admin'`;
non-admins are redirected to `/app`.

### 2.5 Retention

A scheduled job deletes `events` where `createdAt < now() - EVENT_RETENTION_DAYS`.
`EVENT_RETENTION_DAYS` env, default `365`. Mechanism (Fly scheduled
machine / cron vs. an internal interval) is finalized in the implementation
plan; the deletion query and config contract are fixed here.

---

## 3. Dashboard (Layout A — single scrolling page)

Route: `/admin` in `apps/web`, behind the admin guard, using existing
shadcn/Tailwind components and the app's blue-merle/copper palette. A global
date-range selector (default last 30 days) scopes all panels.

**KPI strip (top):** total users, WAU, DAU/MAU stickiness ratio, total events
in range — each with a delta vs. previous period where meaningful.

**Panels, stacked:**

1. **Growth & users** — signups over time (daily/weekly bar/line),
   cumulative user growth, list of most recent registrations.
2. **Active usage** — DAU / WAU / MAU trend derived from `events` +
   `session`; DAU/MAU stickiness.
3. **Event explorer & feature funnel** — event volume by `name` over time;
   product funnel `signup → first dog → first journal entry → first brief`
   (computed from first-occurrence-per-user of the relevant event names;
   renders today, fills in as features ship).
4. **Live activity feed** — reverse-chronological recent events
   (`userId` shortened/opaque, `name`, `createdAt`, safe `props`),
   `LIMIT 100`, refreshed on load / manual refresh (no websockets in v1).

**API:** `GET /api/admin/metrics` (behind `requireAdmin`) returns the
aggregates for all panels for the requested range in one typed payload
(via `hc<AppType>`). Activity feed may be a second endpoint
(`GET /api/admin/activity`) if pagination/limit cleanliness warrants;
decided in the plan.

---

## 4. Reliability & error handling

- Telemetry writes are fire-and-forget and fully isolated from user request
  paths (Section 2.3).
- `POST /api/events`: rate-limited; rejects unknown event names and
  schema-invalid/oversized `props` (`400`) so the table can't be spammed or
  poisoned with arbitrary keys.
- `/api/admin/*`: `401` anonymous, `403` authenticated non-admin; web
  `/admin` redirects non-admins to `/app`.
- All dashboard queries are read-only, time-bounded by the range selector,
  and row-capped (e.g. activity `LIMIT 100`) — no unbounded full-table scans.

---

## 5. Testing

Uses the repo's existing Vitest setup; the full gate must stay green.

- **Unit:** `recordEvent` swallows DB errors (no throw); event-name allowlist
  + `props` Zod validation accept/reject matrix; retention cutoff date math.
- **Integration (API):** signup emits `user.signed_up`; `POST /api/events`
  rejects unknown name (`400`) and persists a valid event; `/api/admin/metrics`
  returns `401` anon / `403` user / `200` admin; `ADMIN_EMAILS` lazy-promotion
  flips `role` to `admin`.
- **Component (web):** `/admin` guard redirects a non-admin; a metrics panel
  renders correctly from a mocked API payload.

---

## 6. Scope boundaries (YAGNI)

**Out of scope for v1:** session replay; real-time websocket feed (poll /
manual refresh only); cohort retention curves; CSV export; per-user
drill-down pages; heavy charting dependency (prefer lightweight inline
SVG/bars, or at most one small chart lib — decided in the plan); in-app role
management UI (roles via `ADMIN_EMAILS` + DB only).

---

## 7. Deliverable order

1. Migration `0002`: `events` table + indexes + `user_role` enum + `user.role`.
2. `recordEvent` helper + Better Auth lifecycle wiring (`user.signed_up`,
   `user.signed_in`).
3. `POST /api/events` (allowlist + Zod + rate limit) + web `track()` +
   `page.viewed` on route change.
4. `requireAdmin` middleware (incl. `ADMIN_EMAILS` lazy promotion) +
   `GET /api/admin/metrics` (+ activity endpoint if needed) aggregates.
5. `/admin` React dashboard — Layout A, four panels + KPI strip + range
   selector + guard/redirect.
6. Retention job + `EVENT_RETENTION_DAYS` config.
7. Tests (Section 5) + `docs/PROJECT-LOG.md` entry.

Built on an isolated worktree/branch and delivered as a PR (per the
established workflow — no direct-to-main).
