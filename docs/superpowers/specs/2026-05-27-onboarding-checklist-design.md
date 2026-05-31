# Onboarding checklist — design

**Date:** 2026-05-27
**Status:** Approved (design)

## Problem

A brand-new signed-in user sees only `apps/web/src/routes/overview.tsx:29-40` — a
single "Welcome to TuringCare … Let's get started" card pointing to
`/my/dogs/new`. There's no scaffolding for the rest of the first journey: log
some moments, set a training goal, finalize a brief, share it. The
"second-step" activation gap is where first-run users drop off, especially in a
quietly designed app like this where features don't loudly market themselves.

## Goal

Turn the single welcome card into a five-item progress checklist that nudges a
new user through the core product loop end-to-end. Each item is computed live
from existing data — no new schema, no migration. Once the user has done all
five at least once, the checklist collapses into a one-line celebration banner
they can dismiss.

Non-goals: per-dog progress tracking, server-side dismissal state, multi-step
walkthrough overlays/tooltips, gamification badges, "remind me later" snooze.

## Items

Five items, each ✓ when a derived predicate is true. Per-user scope: any owned
dog satisfying the predicate ticks the item.

| Item | Done when | Click destination |
|------|-----------|-------------------|
| Add your first dog | `dogs.length ≥ 1` for the user | `/my/dogs/new` |
| Log 3 moments | `journalEntries.where(kind = "moment") ≥ 3` across all owned dogs | `/my/dogs/:id/journal` (most recently created dog) |
| Set a training goal | `trainingGoals ≥ 1` across all owned dogs | `/my/dogs/:id` (most recently created dog) |
| Finalize a brief | `briefs.where(status = "finalized") ≥ 1` ever (stays ✓ even if a later version is a draft) | `/my/dogs/:id/brief` (most recently created dog) |
| Share with a trainer | `briefSends ≥ 1` (any send via email-a-brief) | `/trainers` (browse the directory; the trainer detail page's "Send brief" CTA is the natural funnel) |

Label note: "Share with a trainer" describes intent. The done-criterion is
"any brief send recorded" — we don't (and can't easily) verify the recipient
is actually a trainer. Close enough as an MVP activation signal; the trainer
detail page's "Send brief" CTA is the funnel that makes the label feel honest.

## UX states

- **Any item incomplete** → render the full checklist card on `/my` overview in
  place of today's "Welcome to TuringCare" card. Each row shows the icon (✓
  filled / ○ outline), the label, and is the click target.
- **All five complete, banner not yet dismissed** → collapse into a one-line
  banner: `✓ You're all set up. 🎉  [Dismiss]`.
- **All five complete, banner dismissed** → render nothing onboarding-related;
  normal overview cards only.
- If completion later drops back to incomplete (e.g. user deletes a dog), the
  checklist reappears. Dismissal applies only to the celebration banner.

## Persistence of "dismissed"

A single boolean in `localStorage`:
`turingcare.onboarding.celebrationDismissed = "true"`. No server-side schema,
no migration. Per-device is acceptable for an MVP-grade banner: a user moving
to a new device sees the banner once and dismisses it again.

## API

New endpoint: `GET /api/onboarding/status` (auth required).

```ts
// Response shape
{
  hasDog: boolean;
  momentsCount: number;          // raw count; the 3-moments threshold is enforced client-side
  hasGoal: boolean;
  hasFinalizedBrief: boolean;
  hasSentBrief: boolean;
  mostRecentDogId: string | null; // for routing per-dog deep-links from the UI
}
```

Implementation: five `db.select({ count: count() })` queries (or `count(*)`
equivalent) plus one `select` for the most-recent owned dog, all in a
`Promise.all`, each scoped by `ownerId = userId`. All five rely on indexes
that already exist (`dogs.ownerId`, `journalEntries.dogId`,
`trainingGoals.dogId`, `briefs.dogId`, `briefSends.dogId`). The query that
finds `mostRecentDogId` orders by `dogs.createdAt desc limit 1`.

Mounted under a new `apps/api/src/routes/onboarding.ts` file with a single
`GET /` handler. Added to `app.ts`'s `.route("/api/onboarding", onboardingApp)`
chain to preserve the `AppType` for the hc<AppType> RPC client.

Chose a dedicated endpoint over folding the booleans into `/api/overview` so
the response shape stays narrowly purposeful and is independently testable.

## Web

- `apps/web/src/lib/onboarding.ts` — `useOnboardingStatus()` hook calling
  `api.api.onboarding.$get()`. Stale time: 10 seconds — short enough that
  clicking an item, doing the action, and coming back updates the row.
- `apps/web/src/components/onboarding/checklist.tsx` — pure-render component:
  takes `status: OnboardingStatus`, decides incomplete-list vs celebration
  vs nothing, manages localStorage dismissal. Self-contained.
- `apps/web/src/routes/overview.tsx` — replace the existing welcome card with
  `<OnboardingChecklist />`. The remaining overview cards (latest journal,
  brief preview) continue to render below as today.
- `apps/web/src/i18n/en.ts` + `es.ts` — five step labels (`addDog`, `logMoments`,
  `setGoal`, `finalizeBrief`, `shareWithTrainer`), section title (`getStarted`),
  celebration line (`allSetUp`), `dismiss` label.

The component itself is the only piece that knows about localStorage; the hook
returns just the API status.

## Tests

- **API** (`apps/api/src/routes/onboarding.test.ts`): fresh user (all five
  false, momentsCount 0, mostRecentDogId null); user with only a dog (hasDog
  true, others false, mostRecentDogId set); user after logging 3 moments
  (momentsCount 3); user with goal but no brief; user with full set (all
  true); owner-isolation (user B's data does not leak into user A's status).
- **Web** (`apps/web/src/components/onboarding/checklist.test.tsx`): renders
  five rows with correct ✓/○ from a stub status; clicking an incomplete row
  navigates to its href; with all five complete and no localStorage flag,
  renders the celebration banner not the full list; clicking Dismiss writes
  the localStorage flag and the banner disappears; with the localStorage flag
  pre-set and all five complete, nothing renders.

## Compatibility / no-change

- **No DB migration.** Reads only against existing tables.
- `/api/overview` is untouched.
- No other route, mutation, or component changes.
- Locale/i18n parity preserved (`es satisfies Messages` + the i18n
  no-untranslated test).

## Edge cases

- Multiple dogs, all activity on one: items still tick from that one dog. The
  per-dog deep-link uses `mostRecentDogId` for predictable routing.
- A finalized brief later superseded by a draft: `hasFinalizedBrief` stays
  true (any historical finalized brief counts).
- User without any dogs: all five rows are ○; only "Add your first dog" feels
  like a meaningful next click. The per-dog deep-link rows still render but
  click to `/my/dogs/new` (fallback when `mostRecentDogId` is null) so they're
  never dead.
- User deletes their only dog after dismissing the celebration banner: the
  checklist reappears because completion is again incomplete. This is the
  desired behaviour — they're effectively starting over.
- localStorage unavailable (rare): dismissal silently no-ops; the banner
  remains visible until the user navigates away. Acceptable.
