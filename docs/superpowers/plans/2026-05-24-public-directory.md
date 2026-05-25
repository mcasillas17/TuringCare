# Public Trainers + Courses Directory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use `- [ ]`.

**Goal:** Move Trainers + Courses out of `/my/*` to public top-level routes (`/trainers`, `/courses`, + `/:id`), browsable by anyone — while protecting trainer email/phone from anonymous scraping (list never returns contact; detail reveals it only to authed users). Public chrome.

**Architecture:** New `optionalUser` middleware; `trainers.ts`/`courses.ts` go public; trainer contact nulled unless authed. Web routes move to the public group, rendered in a `PublicLayout` (SiteNav + SiteFooter); SiteNav gains directory links; trainer-detail gets an anon "Sign up to contact" CTA; all internal `/my/trainers`·`/my/courses` links + test fixtures repoint.

**Tech Stack:** Hono, Better Auth, Drizzle, React 19, react-router v7, TanStack Query, vitest.

**Spec:** `docs/superpowers/specs/2026-05-24-public-directory-design.md`

**Conventions:** Worktree `.claude/worktrees/public-directory`, branch `worktree-public-directory`, off `origin/main`. ONE PR. gpg-unsigned commits ending:
```
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
Env: `set -a && . ./.env && set +a`. **Pre-commit branch assertion:** `git branch --show-current` must equal `worktree-public-directory`; else STOP. Strict TS + biome both 0 before commit; biome forbids non-null assertions (`!`). i18n parity (`es satisfies Messages`).

---

## File Structure

```
apps/api/src/middleware/optional-user.ts               CREATE  optionalUser
apps/api/src/routes/trainers.ts                        MODIFY  optionalUser + null contact unless authed
apps/api/src/routes/trainers.test.ts                   MODIFY  no-auth access + contact-protection tests
apps/api/src/routes/courses.ts                         MODIFY  optionalUser (public)
apps/api/src/routes/courses.test.ts                    MODIFY  anonymous access tests
apps/web/src/components/PublicLayout.tsx               CREATE  SiteNav + main + SiteFooter wrapper
apps/web/src/components/landing/site-nav.tsx           MODIFY  +Trainers/Courses links; section anchors → /#…
apps/web/src/components/landing/site-nav.test.tsx      MODIFY  assert new links
apps/web/src/main.tsx                                  MODIFY  move 4 routes to public group (PublicLayout)
apps/web/src/components/app-shell/nav-items.ts         MODIFY  repoint Trainers/Courses to /trainers,/courses
apps/web/src/routes/trainer-detail.tsx                 MODIFY  anon "Sign up to contact" CTA + back link
apps/web/src/routes/course-detail.tsx                  MODIFY  back link → /courses
apps/web/src/routes/courses.tsx                        MODIFY  row links → /courses/:id
apps/web/src/routes/overview.tsx                       MODIFY  "Find a trainer" → /trainers
apps/web/src/routes/trainer-detail.test.tsx            MODIFY/CREATE  anon vs authed contact
apps/web/src/routes/trainers.test.tsx                  MODIFY  route paths
apps/web/src/routes/courses.test.tsx                   MODIFY  route paths
apps/web/src/routes/course-detail.test.tsx             MODIFY  route paths
apps/web/src/i18n/en.ts                                MODIFY  +nav.courses +trainersDir.signUpToContact*
apps/web/src/i18n/es.ts                                MODIFY  parity
docs/PROJECT-LOG.md                                    MODIFY  shipped entry
```

---

## Task T1: `optionalUser` middleware

**Files:** Create `apps/api/src/middleware/optional-user.ts`.

- [ ] **Step 1: Implement** (mirror `require-user.ts`, never 401):

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

- [ ] **Step 2: Typecheck** — `set -a && . ./.env && set +a && pnpm --filter @turingcare/api exec tsc --noEmit` → 0.

- [ ] **Step 3: Commit**
```bash
git add apps/api/src/middleware/optional-user.ts
git -c commit.gpgsign=false commit -m "feat(api): optionalUser middleware (session if present, no 401)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T2: Trainers route public + contact protection

**Files:** Modify `apps/api/src/routes/trainers.ts`, `apps/api/src/routes/trainers.test.ts`.

- [ ] **Step 1: Write failing tests** — update `trainers.test.ts`:
  - GET `/api/trainers` **without auth headers** → 200 (drop any 401-without-auth expectation).
  - Create a trainer (via admin) that HAS email + phone. Then GET `/api/trainers` (no auth): assert each row's `email` and `phone` are `null` (NOT the real values).
  - GET `/api/trainers/:id` **without auth** → `email`/`phone` are `null`.
  - GET `/api/trainers/:id` **with auth** (a normal `createTestUser`) → `email`/`phone` equal the real values.
  - Existing filter tests (state/specialty/methodology) keep working without auth headers.

- [ ] **Step 2: Run, verify fail** — `pnpm --filter @turingcare/api test trainers.test`.

- [ ] **Step 3: Implement** — in `apps/api/src/routes/trainers.ts`:
  - Import `optionalUser` + `OptionalVars` from `../middleware/optional-user` (remove `requireUser`/`Vars` import if now unused).
  - Change the Hono generic + middleware:
    ```ts
    export const trainersApp = new Hono<{ Variables: OptionalVars }>()
      .use("*", optionalUser)
    ```
  - Keep the existing full `TRAINER_COLS` (includes email/phone) for the DB query. Null the contact fields per the rules in the response:
    ```ts
    .get("/", async (c) => {
      // ...build conds as today...
      const rows = await db.select(TRAINER_COLS).from(trainers).where(conds.length ? and(...conds) : undefined);
      // List NEVER exposes contact (bulk-scrape surface), even when authed:
      return c.json({ trainers: rows.map((t) => ({ ...t, email: null, phone: null })) });
    })
    .get("/:id", async (c) => {
      const [trainer] = await db.select(TRAINER_COLS).from(trainers).where(eq(trainers.id, c.req.param("id")));
      if (!trainer) return c.json({ error: "not_found" } as const, 404);
      // Detail reveals contact ONLY to authenticated users:
      return c.json({ trainer: c.get("userId") ? trainer : { ...trainer, email: null, phone: null } });
    });
    ```
  - `notesInternal` stays excluded (already is).

- [ ] **Step 4: Run, verify pass** — `pnpm --filter @turingcare/api test trainers.test` + full api suite green; `pnpm --filter @turingcare/api exec tsc --noEmit` 0.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/routes/trainers.ts apps/api/src/routes/trainers.test.ts
git -c commit.gpgsign=false commit -m "feat(api): trainers directory public; contact nulled unless authed (list never)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T3: Courses route public

**Files:** Modify `apps/api/src/routes/courses.ts`, `apps/api/src/routes/courses.test.ts`.

- [ ] **Step 1: Update tests** — in `courses.test.ts`, change the "GET / requires auth (401)" case to assert anonymous access **succeeds** (200) for both `GET /api/courses` and `/:id`. Keep filter tests (now without auth headers).

- [ ] **Step 2: Run, verify the old 401 expectation now fails.**

- [ ] **Step 3: Implement** — in `apps/api/src/routes/courses.ts`, swap `requireUser`/`Vars` for `optionalUser`/`OptionalVars`:
```ts
import { type OptionalVars, optionalUser } from "../middleware/optional-user";
export const coursesApp = new Hono<{ Variables: OptionalVars }>()
  .use("*", optionalUser)
  // GET / and GET /:id unchanged
```
(Courses have no per-auth difference; `optionalUser` keeps the type tidy without 401ing anonymous users.)

- [ ] **Step 4: Run, verify pass** (courses.test + full api + tsc 0).

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/routes/courses.ts apps/api/src/routes/courses.test.ts
git -c commit.gpgsign=false commit -m "feat(api): courses directory public (anonymous access)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T4: i18n keys

**Files:** Modify `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`.

- [ ] **Step 1:** Add to en.ts:
  - In `nav:` section: `courses: "Courses"` (confirm `nav.trainers` already exists from the landing; if not, add `trainers: "Trainers"`).
  - In `trainersDir:` section: `signUpToContact: "Sign up to contact this trainer."`, `signUpToContactCta: "Sign up"`.
- [ ] **Step 2:** Mirror in es.ts: `courses: "Cursos"`, (`trainers: "Adiestradores"` if missing), `signUpToContact: "Regístrate para contactar a este adiestrador."`, `signUpToContactCta: "Regístrate"`.
- [ ] **Step 3:** `pnpm --filter @turingcare/web exec tsc --noEmit` (parity check) + `pnpm --filter @turingcare/web test -- i18n`.
- [ ] **Step 4: Commit**
```bash
git add apps/web/src/i18n/en.ts apps/web/src/i18n/es.ts
git -c commit.gpgsign=false commit -m "i18n: +nav.courses + signUpToContact keys (en+es)" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T5: PublicLayout + SiteNav directory links

**Files:** Create `apps/web/src/components/PublicLayout.tsx`; modify `apps/web/src/components/landing/site-nav.tsx`, `apps/web/src/components/landing/site-nav.test.tsx`.

- [ ] **Step 1: Create PublicLayout** — `apps/web/src/components/PublicLayout.tsx`:
```tsx
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import type { ReactNode } from "react";

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-6xl px-5 pt-24 pb-16">{children}</main>
      <SiteFooter />
    </>
  );
}
```
(`pt-24` clears the fixed 16-tall SiteNav with breathing room.)

- [ ] **Step 2: SiteNav links** — in `site-nav.tsx`:
  - Change the section-anchor `LINKS` hrefs from `#how`/`#brief`/`#faq` to `/#how`/`/#brief`/`/#faq` (so they navigate to landing + scroll from any page). Drop the `#trainers` section anchor.
  - Add two router `<Link>` items in the desktop nav (next to the section links): `<Link to="/trainers">{t("nav.trainers")}</Link>` and `<Link to="/courses">{t("nav.courses")}</Link>` (style them like the existing nav `<a>` items). Use `Link` from react-router-dom (already imported).

- [ ] **Step 3: Test** — in `site-nav.test.tsx`, add assertions that the Trainers (`/trainers`) and Courses (`/courses`) links render. (The file already mounts SiteNav in a MemoryRouter; mirror its existing pattern + `vi.mock` of `useSession` if present.)

- [ ] **Step 4: Run, verify pass** (test -- site-nav; tsc 0).

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/components/PublicLayout.tsx apps/web/src/components/landing/site-nav.tsx apps/web/src/components/landing/site-nav.test.tsx
git -c commit.gpgsign=false commit -m "feat(web): PublicLayout + Trainers/Courses links in SiteNav" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T6: Move routes to public + repoint all links + fix test fixtures

**Files:** Modify `apps/web/src/main.tsx`, `apps/web/src/components/app-shell/nav-items.ts`, `apps/web/src/routes/{courses,course-detail,overview}.tsx`, and the moved-route test fixtures (`trainers.test.tsx`, `courses.test.tsx`, `course-detail.test.tsx`).

- [ ] **Step 1: Move the four routes in `main.tsx`** out of the `<Route element={<RequireAuth/>}>` group into the public group (near `/privacy`, `/b/:token`), each wrapped in `<PublicLayout>`:
```tsx
<Route path="/trainers" element={<PublicLayout><Trainers /></PublicLayout>} />
<Route path="/trainers/:id" element={<PublicLayout><TrainerDetail /></PublicLayout>} />
<Route path="/courses" element={<PublicLayout><Courses /></PublicLayout>} />
<Route path="/courses/:id" element={<PublicLayout><CourseDetail /></PublicLayout>} />
```
Remove the old `/my/trainers`, `/my/trainers/:id`, `/my/courses`, `/my/courses/:id` routes from the RequireAuth group. Import `PublicLayout`. (Imports for Trainers/TrainerDetail/Courses/CourseDetail already exist.)

- [ ] **Step 2: Repoint the sidebar** — `nav-items.ts`: change the Trainers item `to: "/my/trainers"` → `"/trainers"` and Courses `to: "/my/courses"` → `"/courses"`.

- [ ] **Step 3: Repoint all internal links.** Grep and fix every occurrence:
```bash
grep -rn '"/my/trainers\|"/my/courses\|`/my/trainers\|`/my/courses' apps/web/src
```
Known sites: `course-detail.tsx` back link (`/my/courses` → `/courses`), `courses.tsx` row links (`/my/courses/${id}` → `/courses/${id}`), `trainer-detail.tsx` back link (`/my/trainers` → `/trainers`), `overview.tsx` "Find a trainer" quick action (`/my/trainers` → `/trainers`). Fix all matches. Do NOT touch `/my/brief` (brief stays authed; the PR #30 cross-link is correct).

- [ ] **Step 4: Fix moved-route test fixtures.** In `trainers.test.tsx`, `courses.test.tsx`, `course-detail.test.tsx`: update `MemoryRouter initialEntries={["/my/..."]}` and any `<Route path="/my/...">` to the new `/trainers`, `/courses` paths. (Mechanical — these tests render the page; only the route strings change.)

- [ ] **Step 5: Run gates**
```bash
set -a && . ./.env && set +a
pnpm --filter @turingcare/web exec tsc --noEmit          # 0
pnpm --filter @turingcare/web test                       # all green
pnpm lint                                                 # 0
```
Re-grep to confirm zero remaining `/my/trainers` or `/my/courses` literals in `apps/web/src`.

- [ ] **Step 6: Commit**
```bash
git add apps/web/src/main.tsx apps/web/src/components/app-shell/nav-items.ts apps/web/src/routes/courses.tsx apps/web/src/routes/course-detail.tsx apps/web/src/routes/overview.tsx apps/web/src/routes/trainers.test.tsx apps/web/src/routes/courses.test.tsx apps/web/src/routes/course-detail.test.tsx
git -c commit.gpgsign=false commit -m "feat(web): move trainers+courses to public /trainers,/courses; repoint links + fixtures" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T7: Trainer-detail anonymous "Sign up to contact" CTA

**Files:** Modify `apps/web/src/routes/trainer-detail.tsx`, `apps/web/src/routes/trainer-detail.test.tsx` (create if absent).

- [ ] **Step 1: Write failing tests** — `trainer-detail.test.tsx` (mirror an existing route test; mock `useSession` like `site-nav.test.tsx`):
  - **Anonymous** (`useSession` → `{ data: null }`, stub trainer payload with `email: null, phone: null`): renders the trainer name + a "Sign up to contact" element linking to `/register`; the "Send my Brief to this trainer" button is absent.
  - **Authed** (`useSession` → `{ data: { user: {...} } }`, stub trainer payload with a real `email`): the "Send my Brief to this trainer" button is present; the "Sign up to contact" CTA is absent.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — in `trainer-detail.tsx`:
  - Import `useSession` from `@/lib/auth-client`. `const { data: session } = useSession();`
  - The existing contact block + the PR #30 brief-send button are gated on `tr.email` — which the API nulls for anon — so they already hide for anonymous. Leave that logic.
  - Add, when `!session`, a small panel:
    ```tsx
    {!session && (
      <div className="rounded border border-silver bg-white p-4">
        <p className="text-sm text-slate-soft">{t("trainersDir.signUpToContact")}</p>
        <Button asChild className="mt-2 bg-slate text-cream">
          <Link to="/register">{t("trainersDir.signUpToContactCta")}</Link>
        </Button>
      </div>
    )}
    ```
  - Ensure the back link points to `/trainers` (done in T6, but verify).

- [ ] **Step 4: Run gates** (test -- trainer-detail; tsc 0; lint 0).

- [ ] **Step 5: Commit**
```bash
git add apps/web/src/routes/trainer-detail.tsx apps/web/src/routes/trainer-detail.test.tsx
git -c commit.gpgsign=false commit -m "feat(web): anon 'Sign up to contact' CTA on trainer detail" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task T8: PROJECT-LOG + finish as PR

**Files:** Modify `docs/PROJECT-LOG.md`.

- [ ] **Step 1: Full-repo gate**
```bash
set -a && . ./.env && set +a
pnpm -r exec tsc --noEmit     # 0
pnpm -r test                  # all green (if api hits a Better Auth sign-up 429, wait 90s + re-run once)
pnpm -r build                 # all succeed
pnpm lint                     # 0
git status --porcelain        # clean except untracked .env
```

- [ ] **Step 2: Append `docs/PROJECT-LOG.md`** (bottom; today 2026-05-24):

```markdown
## 2026-05-24 — Public Trainers + Courses directory — SHIPPED
Moved Trainers + Courses out of `/my/*` to public top-level routes
(`/trainers`, `/courses`, + `/:id`) — browsable by anyone, no login. New
`optionalUser` middleware (session if present, never 401). Trainer contact is
scrape-protected: the public list NEVER returns email/phone (even to authed
users), and detail reveals them ONLY to authenticated requests; anonymous
visitors see the profile + a "Sign up to contact" CTA. Courses are fully
public (no PII; link-out to the provider page). Pages render in a new
`PublicLayout` (auth-aware SiteNav + footer); SiteNav gains Trainers/Courses
links (section anchors → `/#…`). Sidebar + all internal links + route-move
test fixtures repointed. Admin CRUD unchanged. Gates green: tsc 0, lint 0,
web + api + shared tests pass, build OK.
- Spec/plan: `specs/2026-05-24-public-directory-design.md`,
  `plans/2026-05-24-public-directory.md`
- Commits: this branch. Shipped as a PR from worktree-public-directory.
```

- [ ] **Step 3: Commit**
```bash
git add docs/PROJECT-LOG.md
git -c commit.gpgsign=false commit -m "docs: PROJECT-LOG entry for public directory" -m "Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: superpowers:finishing-a-development-branch → push + open DRAFT PR.** Do NOT merge.

---

## Self-Review

**Spec coverage:** optionalUser → T1; trainers public + contact protection → T2; courses public → T3; i18n → T4; PublicLayout + SiteNav links → T5; route move + repoint + fixtures → T6; anon trainer CTA → T7; PROJECT-LOG + PR → T8. Out-of-scope items (server-side contact proxy, adaptive chrome, redirects, SEO) untouched. No gap.

**Placeholder scan:** none. T6 step 3 grep is a real command with the known sites enumerated. T5/T7 reference mirroring existing tests — bounded, files named.

**Type/consistency:** `optionalUser`/`OptionalVars` (T1) used by trainers (T2) + courses (T3). `c.get("userId")` is now `string | undefined` (OptionalVars) — handlers null contact accordingly. Single trainer response shape (email/phone present but nulled when unauthorized) matches the web `Trainer` type (`email: string | null`). New routes `/trainers`,`/courses` (T6) match nav-items (T6) + SiteNav links (T5) + all repointed internal links (T6). i18n keys (T4) cover T5/T7 usages.
