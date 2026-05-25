# TuringCare — Public Trainers + Courses directory (option C)

**Date:** 2026-05-24
**Status:** Approved. Move Trainers + Courses out of `/my/*` to **public**
top-level routes (`/trainers`, `/courses`, + `/:id`), browsable by anyone
without login — "a platform to connect, not gatekeep." **Protect the trainers:**
the public API never exposes trainer email/phone to anonymous requests; contact
details are revealed only to authenticated users. Courses are fully public (no
PII). Public chrome (SiteNav + SiteFooter). Ready for plan.

## Goal

Discovery is the platform's job — owners (and prospective owners not yet signed
up) should browse trainers and courses freely. Today both directories sit under
the auth-gated `/my/*` namespace, which is semantically wrong (they're catalogs,
not "my" data) and blocks pre-signup discovery. This slice moves them to public
top-level routes and opens them to anonymous visitors — while protecting trainer
contact info from anonymous scraping.

## Threat model + protection (the core of this slice)

Going public exposes the trainer directory to anonymous bots. The real risk is
**bulk scraping of trainer email/phone → spam**. Mitigation:

- **Public trainer LIST (`GET /api/trainers`) never returns email/phone.**
  Returns name, businessName, city, state, methodologyTags, certifications,
  specialties, website. Lists are where bulk harvest hurts most and never need
  contact info.
- **Trainer DETAIL (`GET /api/trainers/:id`) returns email/phone ONLY when the
  request is authenticated.** Anonymous detail = profile + a "Sign up to contact"
  CTA; authed detail = contact info + the brief-send flow.
- A scraper hitting the public API therefore harvests **zero contact info**;
  obtaining an email requires creating an account (friction + rate limits +
  bannable). This kills the bulk-harvest threat while keeping discovery fully
  open.
- **Courses are fully public** — no PII; the action is the provider's own
  `coursePageUrl`.
- Admin CRUD routes stay `requireAdmin` (unchanged). The global rate limiter
  already covers anonymous traffic.

**Deferred (noted, not built):** the gold-standard "never expose trainer email
even to authed users; contact via a server-side proxy" — a real refactor of the
brief-send flow (PR #20/#30 pass the recipient email client-side). The
list-omits-contact + detail-reveals-on-auth approach above stops the actual
(anonymous) threat without that rebuild; harden later if authed-account scraping
appears.

## API

### New middleware: `optionalUser` (`apps/api/src/middleware/optional-user.ts`, NEW)

Mirror `requireUser` but **never 401** — set `userId` if a session exists, else
leave it unset:

```ts
import { createMiddleware } from "hono/factory";
import { auth } from "../auth";

export type OptionalVars = { userId?: string };

export const optionalUser = createMiddleware<{ Variables: OptionalVars }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session) c.set("userId", session.user.id);
  await next();
});
```

### `apps/api/src/routes/trainers.ts` (MODIFY)

- Replace `.use("*", requireUser)` with `.use("*", optionalUser)`.
- Define two projections:
  - `PUBLIC_TRAINER_COLS` = current `TRAINER_COLS` **minus `email` and `phone`**.
  - Detail adds `email` + `phone` only when authed.
- **List** `GET /`: always `db.select(PUBLIC_TRAINER_COLS)` (filters unchanged:
  state, specialty, methodology). Never returns email/phone.
- **Detail** `GET /:id`: select `PUBLIC_TRAINER_COLS`; if `c.get("userId")` is
  set (authenticated), also select/return `email` + `phone`. Concretely: run the
  authed projection when `userId` exists, else the public one. 404 if not found.

`notesInternal` stays excluded in both (already is). Response shape: anonymous
detail has `email`/`phone` absent (or null); authed detail has them populated.

### `apps/api/src/routes/courses.ts` (MODIFY)

- Replace `.use("*", requireUser)` with `.use("*", optionalUser)` (or drop the
  middleware entirely — courses have no per-auth difference). Behavior otherwise
  unchanged; fully public.

### Mounting (`apps/api/src/app.ts`)

No path changes (`/api/trainers`, `/api/courses` stay). Only the middleware
inside each app changes. Admin routes unchanged.

### API tests

- `trainers.test.ts` (MODIFY): GET `/` works **without** auth and returns rows
  with **no `email`/`phone`** (assert those keys are absent/undefined, even for a
  trainer that has them in the DB). GET `/:id` **anonymous** omits email/phone;
  GET `/:id` **authed** includes them. Existing filter tests keep working
  (now without auth headers).
- `courses.test.ts` (MODIFY): GET `/` and `/:id` work **without** auth (drop the
  401-without-auth expectation; assert anonymous access succeeds).

## Web

### Routing (`apps/web/src/main.tsx`, MODIFY)

Move these four routes from inside the `RequireAuth` group to the **public**
group (alongside `/`, `/login`, `/privacy`, `/b/:token`):

```
/my/trainers      → /trainers
/my/trainers/:id  → /trainers/:id
/my/courses       → /courses
/my/courses/:id   → /courses/:id
```

Each renders inside the public chrome (below). Update the in-file imports
(routes already exist; only the `<Route path>` + grouping change).

### Public chrome

The four directory pages render with the public **SiteNav + SiteFooter** (not
the app-shell sidebar). PR #9 already made SiteNav auth-aware (shows "Open app →"
when logged in, "Log in / Get started" when not), so logged-in users aren't
stranded.

- **`apps/web/src/components/landing/site-nav.tsx` (MODIFY):** add router `<Link>`
  items for **Trainers** (`/trainers`) and **Courses** (`/courses`) so visitors
  discover them. The existing section links (`#how`, `#brief`, `#trainers`,
  `#faq`) only work on the landing page; change them to `/#how`, `/#brief`,
  `/#faq` so they navigate to the landing + scroll from any page. (Drop the
  `#trainers` section anchor in favor of the new `/trainers` route link.)
- The directory route elements wrap their page in SiteNav + SiteFooter. Extract a
  tiny `PublicLayout` (`apps/web/src/components/PublicLayout.tsx`, NEW) =
  `<SiteNav/>` + `<main className="pt-16 …">{children}</main>` + `<SiteFooter/>`,
  and wrap the four directory pages with it in `main.tsx`. (Account for the fixed
  SiteNav height with top padding.)

### Trainer detail (`apps/web/src/routes/trainer-detail.tsx`, MODIFY)

- The API now omits `email`/`phone` for anonymous requests, so the existing
  `{tr.email && …}` contact rendering + the PR #30 "Send my Brief to this
  trainer" button (already gated on `tr.email`) **automatically hide for
  anonymous users** — no logic change needed there.
- Add an anonymous CTA: when there is no session (use `useSession()` from
  `@/lib/auth-client`), render a "Sign up to contact this trainer" panel linking
  to `/register`. Hide it for authed users (who see the real contact + brief
  send).

### Course detail / browse — no protection logic needed

Courses expose no PII; the "View full details & register ↗" `coursePageUrl` link
works for everyone. Browse + detail just move to public routes + public chrome.

### App-shell sidebar (`apps/web/src/components/app-shell/nav-items.ts`, MODIFY)

Update the Trainers + Courses nav `to` paths from `/my/trainers`, `/my/courses`
to `/trainers`, `/courses`. They stay in the sidebar for logged-in users; the
links now point to the public paths (clicking leaves the sidebar into the public
directory chrome — acceptable; PR #9's "Open app →" returns them).

### Internal links to update

Anything pointing at `/my/trainers` or `/my/courses` must move to `/trainers`,
`/courses`:
- `overview.tsx` quick-action "Find a trainer" (`/my/trainers` → `/trainers`).
- `course-detail.tsx` "back to courses" (`/my/courses` → `/courses`).
- `trainer-detail.tsx` back link (`/my/trainers` → `/trainers`).
- `courses.tsx` row links (`/my/courses/:id` → `/courses/:id`).
- The PR #30 cross-link target is `/my/brief` (unaffected — brief stays authed).
- Grep `"/my/trainers` and `"/my/courses` across `apps/web/src` to catch all.

### i18n (`apps/web/src/i18n/{en,es}.ts`, MODIFY)

- Add `nav.courses` ("Courses" / "Cursos") for the SiteNav link (`nav.trainers`
  likely already exists from the landing; reuse it for the SiteNav `/trainers`
  link, or add if missing).
- Add `trainersDir.signUpToContact` ("Sign up to contact this trainer" / "Regístrate
  para contactar a este adiestrador") + `trainersDir.signUpToContactCta`
  ("Sign up" / "Regístrate") for the anonymous trainer-detail CTA.
- Parity enforced by `es satisfies Messages`.

## Web tests

- Route-move fixtures: any test rendering trainers/courses via `MemoryRouter`
  with `initialEntries={["/my/trainers..."]}` / Route paths updated to the new
  `/trainers`, `/courses` paths (mechanical, like the `/app → /my` rename).
- `trainer-detail.test.tsx` (MODIFY/extend): anonymous (no session, stub
  trainer payload without email/phone) → shows "Sign up to contact", hides the
  brief-send button; authed (session + email present) → shows contact + brief
  send. (Mock `useSession` like `site-nav.test.tsx` does.)
- `site-nav.test.tsx` (MODIFY): assert the new Trainers + Courses links render.
- Existing `trainers.test.tsx` / `courses.test.tsx` / `course-detail.test.tsx`
  keep passing with the new paths.

## Out of scope (deliberate)

- **Server-side contact proxy** (gold-standard email hiding) — deferred; the
  list-omits + detail-on-auth approach stops the anonymous-scraping threat.
- **Adaptive chrome** (app-shell sidebar on the directory pages when logged in)
  — public chrome always for MVP; sidebar↔directory is a future polish.
- **Public anonymous brief-send / journaling** — those stay authed; anonymous
  trainer contact routes through "Sign up".
- **SEO meta/sitemap for the public directory** — nice future add; not this slice.
- **Old `/my/trainers` → `/trainers` redirects** — beta has ~no external
  bookmarks; skip (a 3-line catch-all redirect is a trivial later add if needed).

## Flagged decisions (reasonable; reviewable)

- **Public list omits trainer email/phone; detail reveals them only to authed
  users** via a new `optionalUser` middleware + a two-tier projection. Core of
  "protect the trainers." Anonymous scraping yields no contact info.
- **Public chrome always** (SiteNav + SiteFooter) on the directory pages. PR #9's
  auth-aware SiteNav keeps logged-in users oriented ("Open app →"). Adaptive
  sidebar deferred.
- **Anonymous trainer contact → "Sign up to contact"** rather than exposing the
  email. Courses need no such gate (link-out, no PII).
- **No redirects from the old `/my/*` paths** — beta, no live bookmarks.
- **Section anchors in SiteNav become `/#…`** so they work from any page now that
  SiteNav renders off-landing.
- **Admin CRUD untouched** — still `requireAdmin`.
