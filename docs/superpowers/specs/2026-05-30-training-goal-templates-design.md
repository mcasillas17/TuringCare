# Training goal templates (curated curriculum) — design

**Date:** 2026-05-30
**Status:** Approved (design)

## Problem

The journey from sign-up to first finalized brief now has a clear nudge —
the onboarding checklist (PR #38) walks the user through "Set a training
goal." But once they click that row, they land on a bare text input. They
must invent a goal name from scratch, then invent skill names under it, then
guess what their dog's confidence on each skill means. For most pet owners
without a trainer, this is a knowledge wall: they don't know what to track,
they don't know what "confidence 3 of 5" means for *their* dog, and the app
gives them no learning content to lean on.

The current `confidence: 1-5` per skill renders in the brief as generic
labels (`Not yet / Learning / Sometimes / Usually / Consistently`). Those
labels describe a state, not a milestone — they don't tell the owner what
"Level 3 Sit" looks like vs "Level 3 Recall."

## Goal

Ship a small **curated training curriculum** the user can opt into when
adding a goal. The curriculum:

1. Lives in code as a static, typed `const` (no DB content, no editorial
   pipeline). Author once, ship.
2. Defines 5 starter **templates** (goal bundles), each with a description and
   3-5 skills.
3. Defines a **description** for each skill, plus **5 level-specific
   milestone definitions** that replace the generic confidence labels for
   that skill.

Picking a template applies it atomically (one click after a confirmation
preview) — creating the goal + all its skills with `confidence: 1` and the
curated key persisted on each row so the UI can look up the rich content.

Non-goals: localizing the catalog (English only for MVP); user-editable
templates / sharable templates; AI-generated content; gamification badges;
"dismissable" templates; auto-recommending templates based on dog profile.

## Catalog (the source of truth)

A static `const` in `apps/api/src/data/training-catalog.ts`:

```ts
type CatalogLevel = { level: 1 | 2 | 3 | 4 | 5; description: string };

type CatalogSkill = {
  key: string;          // e.g. "basic-manners.sit" — stable identifier
  name: string;         // e.g. "Sit"
  description: string;  // one-line summary
  levels: CatalogLevel[]; // exactly 5, ordered 1..5
};

type CatalogTemplate = {
  key: string;          // e.g. "basic-manners"
  name: string;
  description: string;
  skills: CatalogSkill[];
};

export const trainingCatalog: CatalogTemplate[] = [...];
```

The 5 starter templates and their full content follow. Authoring is
intentionally tight: ~15 words per skill description, ~12 words per level
definition, written in plain humane-positive-reinforcement language.

### Template 1: `basic-manners` — Basic Manners
*Foundational behaviors every dog should know*

**`basic-manners.sit` — Sit** — Dog reliably sits on cue
- L1: Lures into a sit with food in a quiet room
- L2: Sits on a verbal or hand cue without food lure in a quiet room
- L3: Sits on cue with one mild distraction present
- L4: Sits on cue in busier indoor or backyard settings
- L5: Sits on cue across most environments, including outdoors

**`basic-manners.down` — Down** — Dog lies down on cue and holds the position
- L1: Goes into a down with a food lure in a quiet room
- L2: Downs on cue without a lure in a quiet room
- L3: Downs on cue with mild distractions present
- L4: Holds the down 30+ seconds in moderately busy settings
- L5: Downs and holds on cue across most environments

**`basic-manners.stay` — Stay** — Dog holds position until released
- L1: Holds a sit or down for 3-5 seconds, owner next to dog
- L2: Holds for 10+ seconds with owner taking one step away
- L3: Holds for 30 seconds with owner moving around the room
- L4: Holds with light distractions (door opening, food on counter)
- L5: Reliable 60+ second stay with significant distractions

**`basic-manners.recall` — Come (recall)** — Dog returns when called
- L1: Comes to you from across the room in a quiet space
- L2: Comes through one open doorway when called
- L3: Comes when called inside the house with mild distractions
- L4: Comes when called in a fenced outdoor area with moderate distractions
- L5: Reliable recall in unfenced areas, including with strong distractions

**`basic-manners.loose-leash` — Loose-leash walking** — Dog walks without pulling
- L1: Walks calmly beside you in the house or driveway
- L2: Walks without pulling for short stretches on a quiet street
- L3: Walks without pulling past mild distractions (parked cars, smells)
- L4: Walks without pulling around moderate distractions (people, distant dogs)
- L5: Maintains loose leash on busy walks with significant distractions

### Template 2: `puppy-fundamentals` — Puppy Fundamentals
*The first lessons for puppies under 6 months*

**`puppy-fundamentals.name-recognition` — Name recognition** — Puppy turns head to their name
- L1: Turns to look when name is said in a quiet room
- L2: Turns to look with mild background sounds
- L3: Turns and moves toward you when called in the house
- L4: Responds to name even when engaged with a toy
- L5: Responds to name in distracting outdoor settings

**`puppy-fundamentals.potty-signal` — Potty signal** — Puppy communicates the need to go outside
- L1: Goes potty outside when taken on a frequent schedule
- L2: Holds it briefly inside between scheduled outings
- L3: Shows a noticeable signal (sniffing, going to door) when needs to go
- L4: Consistently uses a signal (bell, door touch) to request to go out
- L5: Reliably signals and waits to be taken out, no accidents for a full week

**`puppy-fundamentals.sit` — Sit (puppy-paced)** — Puppy sits on cue
- L1: Sits with a food lure in a quiet space
- L2: Sits on a verbal cue with treats nearby
- L3: Sits before meals or when greeted at the door
- L4: Sits during short impulse-control practice
- L5: Sits reliably with mild distractions as a default greeting behavior

**`puppy-fundamentals.bite-inhibition` — Bite inhibition** — Puppy learns to soften mouth pressure
- L1: Reduces hard mouthing when given a chew toy as an alternative
- L2: Stops mouthing when play pauses (gentle "ouch" + freeze)
- L3: Mostly mouths with no pressure on skin
- L4: Rare mouthing; redirects easily to toys
- L5: No mouthing of people; reliably uses appropriate chew items

**`puppy-fundamentals.settle-on-mat` — Settle on mat** — Puppy learns to relax in a designated spot
- L1: Lies on mat with food scattered, owner kneeling nearby
- L2: Lies on mat for 1-2 minutes calmly
- L3: Settles on mat for 5+ minutes during low activity
- L4: Settles on mat during meal prep or other distractions
- L5: Goes to mat on cue and settles for 10+ minutes during household activity

### Template 3: `reactivity-work` — Reactivity Work
*Building calm responses to triggers*

**`reactivity-work.threshold-awareness` — Threshold awareness** — Owner recognizes the dog's stress signals before reactivity
- L1: Owner can identify the dog's calm baseline body language
- L2: Owner recognizes early stress signals (lip licking, freezing, ears back)
- L3: Owner identifies the dog's threshold distance from common triggers
- L4: Owner adjusts walks and setups to stay under threshold consistently
- L5: Owner anticipates and prevents over-threshold encounters in most situations

**`reactivity-work.look-at-that` — Look at that (LAT)** — Dog looks at a trigger and turns back for a reward
- L1: Dog notices a stationary low-intensity trigger and takes a treat
- L2: Dog glances at trigger and orients back to owner for treat
- L3: Dog performs LAT with a moving trigger at safe distance
- L4: Dog performs LAT in moderate proximity to triggers
- L5: LAT becomes a reflexive, automatic response in trigger-rich environments

**`reactivity-work.engage-disengage` — Engage-disengage** — Dog disengages from a trigger on cue or voluntarily
- L1: Disengages from low-intensity trigger when owner says marker word
- L2: Voluntarily disengages and looks at owner within 5 seconds
- L3: Disengages reliably from moderate triggers at safe distance
- L4: Disengages from triggers at closer distances or higher intensity
- L5: Reliable disengagement across most trigger contexts

**`reactivity-work.settle-in-distractions` — Settle in distractions** — Dog can settle calmly despite environmental triggers
- L1: Settles on mat or at owner's feet in quiet outdoor space
- L2: Settles for 5+ minutes in a calm public space (e.g., quiet cafe patio)
- L3: Settles with mild ambient distractions (other people, dogs at distance)
- L4: Settles in moderately busy environments with brief check-ins
- L5: Reliable, sustained settle in busy public settings

### Template 4: `separation-comfort` — Separation Comfort
*Helping your dog feel safe alone*

**`separation-comfort.calm-departures` — Calm departures** — Dog stays relaxed during the leaving routine
- L1: Owner can pick up keys without triggering anxiety
- L2: Owner can put on coat and shoes without escalating behavior
- L3: Owner can open and close the door briefly without distress
- L4: Owner can step outside for 1-2 minutes calmly
- L5: Full departure routine elicits a calm response

**`separation-comfort.self-settle` — Self-settle** — Dog can relax on their own without owner attention
- L1: Settles independently for 1-2 minutes with owner in same room
- L2: Settles for 5+ minutes with owner in another room
- L3: Settles for 15+ minutes with owner out of sight
- L4: Settles for 30+ minutes with low-key audio cues (music, TV)
- L5: Reliably self-settles for 1+ hour with minimal supports

**`separation-comfort.stay-alone-duration` — Stay-alone duration** — Dog tolerates being completely alone for increasing time
- L1: Tolerates 2-5 minutes alone without panic behavior
- L2: Tolerates 15 minutes alone calmly
- L3: Tolerates 30-45 minutes alone with no destruction or excessive vocalization
- L4: Tolerates 1-2 hours alone reliably
- L5: Comfortable alone for typical workday lengths

### Template 5: `recall-reliability` — Recall Reliability
*A dog that comes when called, every time*

**`recall-reliability.name-response` — Name response** — Dog orients to name as the start of recall
- L1: Looks toward you when name is said in quiet space
- L2: Looks and takes a step toward you when called
- L3: Reliably orients to name in moderate distractions
- L4: Orients to name even when actively engaged
- L5: Name reliably interrupts focus on most distractions

**`recall-reliability.recall-on-cue` — Recall on cue** — Dog returns when called with a specific recall word
- L1: Comes from 2-3 feet away on cue in a quiet space
- L2: Comes from across a room on cue with mild distractions
- L3: Comes from short distance (15+ feet) in fenced outdoor area
- L4: Comes from longer distance with moderate distractions
- L5: Reliable recall on cue across typical outdoor distractions

**`recall-reliability.recall-through-distractions` — Recall through distractions** — Dog returns even when something interesting is happening
- L1: Recalls from low-value distraction (toy on floor) on first try
- L2: Recalls past mild moving distraction (person walking by)
- L3: Recalls from sniffing a moderately interesting spot
- L4: Recalls away from another dog or person at a distance
- L5: Recalls reliably from most high-value distractions

**`recall-reliability.recall-at-distance` — Recall at distance** — Dog returns when called from far away
- L1: Comes when called from 10-15 feet
- L2: Comes when called from 30 feet
- L3: Comes when called from 50+ feet in fenced area
- L4: Comes when called from 100+ feet on a long line
- L5: Off-leash recall reliable at significant distances in appropriate settings

**Content totals:** 5 templates · 21 skills · 105 level definitions.

## Schema — one nullable text column per table

- `trainingGoals.catalogGoalKey text NULL` (e.g. `"basic-manners"`)
- `trainingSkills.catalogSkillKey text NULL` (e.g. `"basic-manners.sit"`)

Set when a goal/skill is created from a template; null for user-created.
Renaming the row does not break the lookup (the key persists). Single
migration adds both columns. No backfill — existing rows stay null and
render with generic confidence labels.

## API

### `GET /api/training/templates`
Auth required (so we can later personalize without breaking the contract).
Returns the full catalog as JSON:

```ts
{ templates: CatalogTemplate[] }
```

Cached client-side; templates rarely change.

### `POST /api/dogs/:id/goals/from-template`
Auth + dog-ownership required. Body:

```ts
{ templateKey: string }
```

Atomically (single transaction):
1. Insert one row into `trainingGoals` with `goal = template.name`,
   `catalogGoalKey = template.key`.
2. Insert one row into `trainingSkills` per skill in the template, each with
   `goalId = newGoal.id`, `name = skill.name`, `confidence = 1`,
   `position = index`, `catalogSkillKey = skill.key`.

Returns `201 { goal, skills }`. Invalid `templateKey` → `400 invalid_template`.

The existing `POST /api/dogs/:id/goals` (custom free-text + auto-default-skill)
is **unchanged**.

## Web

### Hook: `useTrainingCatalog()`
`apps/web/src/lib/training-catalog.ts`. TanStack Query, `queryKey: ["training-catalog"]`, generous `staleTime` (1 hour — content rarely changes). Returns the catalog response. Consumed by both the picker and the progress panel.

### Hook: `useApplyTemplate(dogId)`
Same file or `apps/web/src/lib/progress.ts`. `useMutation` calling the new endpoint. `onSuccess` invalidates `["dogs", dogId]`, `["dog-progress", dogId]` (whatever the progress query key is), and `["onboarding"]` (so the checklist's "Set a training goal" row ticks).

### Picker: `<TemplatePicker dogId={dogId} />`
`apps/web/src/components/training/template-picker.tsx`. Owns the dropdown + preview UX.
- Default state: a `Templates ▼` button.
- Clicked: dropdown lists the 5 template names + one-line descriptions.
- Clicking a template name: expands an inline preview card showing the goal description and each skill (name + description). Two buttons: `Cancel` (closes the preview, returns to dropdown) and `Apply` (calls `useApplyTemplate`, closes the picker on success).
- Apply success → toast + the goals list above updates from the cache invalidation.

### Dog detail integration
`apps/web/src/routes/dog-detail.tsx`. The existing goal-add row (input + `Add Goal` button) gets the picker rendered immediately after it, on the same line where layout permits:

```
[ Add a goal... ] [ Add Goal ] [ Templates ▼ ]
```

### Progress panel enrichment
`apps/web/src/components/progress/progress-panel.tsx`. For each skill row, if `skill.catalogSkillKey` is set AND the catalog returns content for that key:
- Render the skill's `description` as a small subtitle under the skill name.
- Render the current level's description below the confidence selector:
  `Level 3 — Responds in mild distractions`
- Optionally render a one-line "Next: Level 4 — …" hint when current confidence < 5.

Skills without `catalogSkillKey` (or whose key is no longer in the catalog) render unchanged — graceful degradation.

## i18n — English-only catalog for MVP

The 110 level definitions + 22 skill descriptions + 5 template descriptions ship in English only. UI chrome around the picker — `Templates`, `Apply`, `Cancel`, `Will add these skills`, `Level {N} — …`, the toast — is i18n'd in `en` + `es` as usual.

Rationale: trainer-craft phrases (LAT, threshold awareness, bite inhibition) often cross languages untranslated, and authoring high-quality Spanish content roughly doubles the editorial effort. Spanish users see English curated content but the surrounding app remains localized. Localization is a clean future addition (the catalog is a single file).

## Tests

### API
- `GET /api/training/templates` returns the catalog when auth'd; 401 unauth.
- `POST /from-template` with a valid `templateKey` creates the goal + the
  expected number of skills, with the right `catalogGoalKey` / `catalogSkillKey`
  values and `confidence = 1`, `position` matching catalog order.
- Atomicity: passing a key not in the catalog → `400 invalid_template`, and
  no goal/skill rows created (verify with a follow-up SELECT).
- Owner isolation: user B applying a template to user A's dog → 404.

### Web
- `TemplatePicker` renders 5 template names from the catalog stub.
- Clicking a template shows the preview card with the right description +
  skills list.
- Clicking `Apply` calls `useApplyTemplate.mutateAsync` with the right
  `templateKey`.
- `useApplyTemplate.onSuccess` invalidates `["onboarding"]` (the onboarding
  checklist's "Set a training goal" row should refetch).
- Progress panel renders the catalog `description` subtitle + level text
  when `catalogSkillKey` matches a catalog entry; renders bare-name +
  generic confidence when not.

## Compatibility / no-change

- Existing `POST /api/dogs/:id/goals` (custom flow) untouched.
- Existing skill CRUD untouched.
- Brief composition (`composeBrief`) untouched. Possible follow-up: enrich
  emailed briefs with catalog level descriptions for trainers — explicit
  non-goal here.
- Onboarding checklist's "Set a training goal" row continues to count any
  goal (template-applied counts the same as custom).
- The `from-template` mutation invalidates the onboarding query key, so the
  checklist row ticks immediately after applying.

## Edge cases

- **Rename a template-applied goal/skill.** `catalogXxxKey` stays; lookup
  still works; UI shows the catalog description but uses the user's renamed
  name.
- **Apply the same template twice.** Two goals created with the same name
  and `catalogGoalKey`. No dupe-prevention in MVP — user can delete the
  extra.
- **Catalog key referenced that no longer exists** (future schema drift —
  e.g., we remove a template). UI degrades to generic rendering. No crashes.
- **Confidence = 1 on creation.** Progress panel shows "Level 1 — …" for the
  newly-created skill.
- **Custom skill named identically to a catalog skill** (e.g. user types
  "Sit"). No `catalogSkillKey` is set — generic rendering. We don't fuzzy-
  match because that would silently couple user content to curated content.
