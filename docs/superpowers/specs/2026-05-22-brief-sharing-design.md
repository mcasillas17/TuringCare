# Behavior Brief Sharing — Design Spec

**Date:** 2026-05-22
**Status:** Approved (brainstorming)
**Topic:** MVP #4 — let an owner share a dog's Behavior Brief with a trainer via a revocable, read-only public link. Builds on the merged client-side Brief PDF (#17).

---

## 1. Goal & scope

Close the core product loop ("share that Brief with a trainer") with the
simplest self-contained mechanism: a **revocable read-only link**. No login
required for the recipient; the owner mints a link, sends it however they like,
and can revoke it anytime.

### Decisions locked during brainstorming
| Decision | Choice |
|---|---|
| Mechanism | Shareable read-only link (no email send this phase) |
| Lifecycle | Revocable, **no auto-expiry** |
| Snapshot semantics | Token lives on a specific `briefs` row → the link shows the brief snapshot that was shared; regenerating the brief doesn't change an existing shared link |
| Recipient auth | None — fully public page |
| Exposed data | Dog name + composed brief summary + status/version/generatedAt only |

**Out of scope (YAGNI):** email-the-link (deferred; the link is the
foundation), auto-expiry, view counts/analytics, multiple links per brief,
password-protected links, sharing drafts vs finalized distinction (any existing
brief can be shared).

---

## 2. Data model

Migration `0003`: add a nullable, **unique** `shareToken` (text) column to the
existing `briefs` table.
- `shareToken = null` → brief is private (default).
- non-null → that brief snapshot is shared at `/b/<token>`.
- Unique index enforces token uniqueness; nullable so private briefs don't
  collide on null (Postgres treats nulls as distinct in a unique index).

No new tables. Snapshot semantics are automatic: the token is bound to one
`briefs` row (version); a regenerate inserts a new row with `shareToken = null`.

---

## 3. API

### Owner endpoints (added to the existing owner-scoped `dogs` sub-app — session + dog ownership required, mirroring the current `/:id/brief` routes)
- `POST /api/dogs/:id/brief/share` → **mint**. Requires the dog to have a brief
  (else `404`/clear error). If the current brief has no `shareToken`, generate
  a crypto-random token (`crypto.randomBytes(18)` → base64url, ~24 chars) and
  store it; idempotent (returns the existing token if already shared).
  Returns `{ token, url }`, `url = ${env.FRONTEND_URL}/b/${token}`.
- `DELETE /api/dogs/:id/brief/share` → **revoke**. Sets `shareToken = null` on
  the dog's current brief. Returns `{ ok: true }`.
- `GET /api/dogs/:id/brief` (existing) is extended to include `shareToken` in
  its response so the owner UI knows the current share state.

### Public endpoint (no auth)
- `GET /api/share/brief/:token` → look up the brief by `shareToken`. Returns
  `{ brief: { dogName, summary, status, version, generatedAt } }`, or **404**
  if no brief carries that token. Revoked and never-existed tokens both return
  `404` (no enumeration signal). Joins `briefs → dogs` for `dogName`; exposes
  **nothing else** (no userId, email, dog id, or raw journal rows).
- Mounted as a public route on the app (chained for `AppType`), NOT behind any
  auth gate. Covered by the existing global in-memory rate limiter (it's
  `/api/*`, not `/api/auth/*`).

---

## 4. Web

### Owner — `apps/web/src/routes/brief.tsx`
A "Share" control alongside the existing actions, driven by `shareToken` from
the brief query:
- Not shared → **"Create share link"** button → mint → shows the link in a
  read-only input + **Copy** + **"Stop sharing"**.
- Shared → link + Copy + Stop sharing.
- Revoke → back to the "Create share link" state.
- Typed `hc<AppType>` calls + TanStack Query (invalidate the brief query after
  mint/revoke). New i18n keys, en+es parity.

### Public — new route `/b/:token` in `main.tsx`
- Registered **fully public** — not under `RequireAuth`, not under
  `RedirectIfAuthed` (a logged-out trainer, or a logged-in different user, must
  be able to open it).
- `SharedBrief` page (`apps/web/src/routes/shared-brief.tsx`) fetches
  `GET /api/share/brief/:token`, renders read-only: TuringCare `BrandMark`
  header, dog name, composed summary, version/date, and a **Download PDF**
  button reusing the existing `BriefDownloadButton` / `BriefPdfDocument` fed the
  shared `{ dogName, summary }`. No owner-only actions.
- Standalone layout (like the auth pages), outside the app shell.
- `404`/revoked → a friendly "This share link isn't available" view (no detail
  leak); never throws.

---

## 5. Security, privacy & error handling
- Crypto-random unique token; the public endpoint is the only unauthenticated
  read path and returns a strict field whitelist (`dogName`, `summary`,
  `status`, `version`, `generatedAt`).
- Revoke is immediate (`shareToken = null` → public lookup `404`s). Revoked and
  unknown tokens return the same `404`.
- Mint/revoke are owner-only + dog-ownership-scoped (cross-owner → existing
  `404` ownership pattern).
- Token-guessing floods throttled by the existing global limiter.
- No change to auth, cookies, or any existing endpoint's behavior (only the
  owner `GET …/brief` gains a `shareToken` field).
- Mint with no brief yet → clear error; UI only surfaces Share once a brief
  exists. Public page network/404 → friendly not-available view.

---

## 6. Testing
- **API:** mint requires session + ownership (401 anon / 404 cross-owner / 200
  owner), is idempotent, returns `{token,url}`; revoke nulls the token;
  `GET /api/share/brief/:token` returns only the whitelisted fields for a valid
  token and **404** for revoked/unknown; owner `GET …/brief` includes
  `shareToken`. Migration `0003` applied.
- **Web:** `brief.tsx` share control (create → link + copy shown; revoke → back
  to create) via mocked `api`; `shared-brief.tsx` renders from a mocked public
  fetch incl. the Download PDF control, and shows the not-available state on
  `404`.
- Full monorepo gate green (biome, tsc, api + web tests, build).

---

## 7. Deliverable order
1. Migration `0003` — `briefs.shareToken` (unique, nullable).
2. Owner mint/revoke endpoints + `shareToken` in `GET …/brief` (+ API tests).
3. Public `GET /api/share/brief/:token` (+ API tests).
4. Owner Share control in `brief.tsx` (+ i18n, + test).
5. Public `/b/:token` `SharedBrief` page + route (+ test).
6. Full gate + PROJECT-LOG entry; ship as a PR off current `main`.
