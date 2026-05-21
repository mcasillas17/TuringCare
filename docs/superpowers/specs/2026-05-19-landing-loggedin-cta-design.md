# TuringCare — Landing logged-in CTA

**Date:** 2026-05-19
**Status:** Approved (user requested: "instead of the login button in the home page,
if the user is logged in there's a button to go to the app"; confirmed scope as a
small parallel PR off origin/main, independent of the open App Shell PR). Ready
for plan.
**Scope:** `apps/web/src/components/landing/site-nav.tsx`, `apps/web/src/i18n/{en,es}.ts`,
plus a small render test. Independent PR from the `worktree-landing-loggedin-cta`
worktree.

## Goal

On the landing page (`/`), when the user is **logged in** the top-nav action
group shows a single **"Open app"** button linking to the authenticated app
(`/app` today; the route name is a separate, larger follow-up). When **not
logged in**, the existing **"Log in"** + **"Get started"** buttons render
unchanged.

## Existing context

- `apps/web/src/components/landing/site-nav.tsx` currently renders, on every
  visit, `<LanguageToggle />` + `<Button asChild …><Link to="/login">{t("nav.login")}</Link></Button>`
  + `<Button asChild …><Link to="/register">{t("nav.getStarted")}</Link></Button>`.
- `apps/web/src/lib/auth-client.ts` already exports `useSession` from Better
  Auth's React client; it's cached and returns `{ data: session | null, isPending }`
  without an extra API call once the cookie has been resolved.
- The landing page is public — `useSession` here doesn't trigger a redirect; it
  only differentiates rendering.
- `apps/web/src/i18n/{en,es}.ts` has the `nav` section
  (howItWorks/brief/trainers/faq/login/getStarted). We add **one** new key:
  `nav.openApp` (and its Spanish translation).
- The route the CTA links to is **`/app`** today. The future rename PR (its own
  small follow-up after the App Shell PR merges) will retarget this link along
  with every other `/app/*` reference in the codebase.

## Approved change

In `site-nav.tsx`:
1. Add `import { useSession } from "@/lib/auth-client";`
2. In the component body: `const { data: session } = useSession();`
3. Replace the existing 2-button group (Log in + Get started) inside the right
   action `<div className="flex items-center gap-2">` with a **conditional**:
   - **If `session` truthy** → render a single button `<Button asChild className="bg-slate text-cream hover:bg-slate/90"><Link to="/app">{t("nav.openApp")}</Link></Button>`.
   - **Otherwise** → render the existing two buttons exactly as today.
4. `<LanguageToggle />` stays in the action group in both branches.
5. `isPending` is **not** specially handled — Better Auth's client returns the
   cached session synchronously when available, so for users with a live session
   the correct CTA renders without flash. Cold first-load with no cache shows
   the logged-out buttons briefly until the session resolves; acceptable for a
   marketing nav.

In `en.ts`: add `openApp: "Open app",` to the `nav` section.
In `es.ts`: add `openApp: "Abrir app",` to the `nav` section. (Es value differs
from en → the runtime no-untranslated parity test stays green.)

## Testing / verification

The existing `apps/web/src/routes/landing.test.tsx` already renders the landing
under jsdom (no auth cookie → `useSession().data` is `null`) and asserts the
"Log in" / "Get started" affordances. With this change those assertions still
hold for the logged-out path. **Add one new test** specifically for the
logged-in path — a focused `apps/web/src/components/landing/site-nav.test.tsx`
that uses `vi.mock("@/lib/auth-client", …)` to make `useSession` return a
session, renders `<SiteNav />` inside `LocaleProvider` + `MemoryRouter`, and
asserts an "Open app" link is present and the "Log in" affordance is **not**.
Gates: `pnpm --filter @turingcare/web test|exec tsc --noEmit|build`, `pnpm lint`
— all green. No `package.json`/`pnpm-lock` change.

## Out of scope

- Renaming `/app` → something else (its own follow-up PR after App Shell merges;
  blocking on the user's choice of name).
- Touching any non-landing screen (`AppShell` already has its own banner and
  sign-out; the App Shell PR delivers those independently).
- Adding a `Sign out` affordance to the landing nav (out of scope; users can
  reach Settings → Sign out from within the app).

## Flagged decisions (reasonable; reviewable)

- **No `isPending` handling** — cached session returns synchronously for the
  warm path; the brief flash during a true cold network resolve is acceptable
  for a marketing nav. If we ever want zero-flash, the cleanest follow-up is a
  small `useIsAuthed()` that hydrates from a server-set hint cookie.
- **Single "Open app" CTA** (vs. e.g. an "Open app" + "Sign out" pair). Keeps
  the nav clean; sign-out lives inside the app shell where it belongs.
