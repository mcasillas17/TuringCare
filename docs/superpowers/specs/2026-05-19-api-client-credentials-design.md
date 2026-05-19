# TuringCare — API client cross-origin credentials fix (hotfix)

**Date:** 2026-05-19
**Status:** Approved (user reported production 401 on `/api/dogs`; DevTools
showed correct CORS but **no `Cookie` header** on the cross-origin request, and
code inspection confirmed the hono client omits `credentials`). Ready for plan.
**Scope:** one file — `apps/web/src/lib/api.ts`. Its own PR from the
`worktree-fix-api-credentials` worktree.

## Problem

In production the frontend (`https://turingcare.dog`) calls the API
(`https://api.turingcare.dog`) — a **cross-origin** request. The hono RPC
client is created as:

```ts
export const api = hc<AppType>(import.meta.env.VITE_API_URL || "/");
```

No `credentials` option is set, so requests use the Fetch default
`credentials: "same-origin"`. On cross-origin requests the browser therefore
**does not attach cookies**. Evidence from the live request to
`GET https://api.turingcare.dog/api/dogs`:

- Response: `401 Unauthorized`, `access-control-allow-credentials: true`,
  `access-control-allow-origin: https://turingcare.dog` (server CORS + cookie
  config are correct after the Fly secrets fix).
- Request headers contained **no `Cookie` header** → the session cookie
  (set by Better Auth's own client, which *does* send credentials) is never
  sent on the data API calls → `requireUser` 401s → the UI shows
  "Couldn't load your dogs."

Masked until now: in dev `VITE_API_URL` is unset → `hc("/")` is same-origin via
the Vite proxy, so cookies are sent by default; in prod the earlier 502s hid
it. Better Auth's `authClient` includes credentials by default (so login *sets*
the cookie); only the `hc` data client fails to *send* it.

## Approved change

In `apps/web/src/lib/api.ts`, pass `credentials: "include"` to the hono client
so every API request sends cookies, cross-origin or not:

```ts
export const api = hc<AppType>(import.meta.env.VITE_API_URL || "/", {
  init: { credentials: "include" },
});
```

`hc`'s second argument is `ClientRequestOptions`; `init` is a `RequestInit`
applied to every request, and `credentials: "include"` is valid `RequestInit`.
`"include"` is also correct for the dev same-origin path (sending cookies
same-origin is the existing behavior), so it is unconditional. No other change;
imports and the dev/prod URL comment stay.

## Testing / verification

Existing web tests stub `fetch` (jsdom) and don't depend on the credentials
mode, so they stay green; no new test (the behavior is a browser cross-origin
cookie policy not exercisable in jsdom — verified post-deploy by a real login).
Gates: `pnpm --filter @turingcare/web exec tsc --noEmit` 0 (the `init` option
typechecks against `hono/client`), `pnpm -r test` all green, `pnpm -r build`,
`pnpm lint` 0. No `package.json`/`pnpm-lock` change.

## Out of scope

`auth-client.ts` (Better Auth client already includes credentials — login sets
the cookie correctly), CORS/Fly secrets (already fixed operationally), the
production-hardening follow-ups (env fail-fast, password-reset, delete-user
guard) — tracked separately.

## Flagged decisions (reasonable; reviewable)

- `credentials: "include"` is applied unconditionally (dev + prod). It is
  required cross-origin and harmless same-origin; conditionally setting it would
  add complexity for no benefit.
