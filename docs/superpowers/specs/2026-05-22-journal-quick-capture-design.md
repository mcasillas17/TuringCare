# TuringCare — Journal quick-capture redesign

**Date:** 2026-05-22  
**Status:** Approved design. User approved the UX architecture, data/API
direction, UI flow, and safeguards during brainstorming. Ready for written spec
review before implementation planning.  
**Scope:** Simplify the existing upstream `/my/journal` journaling experience
across `packages/shared`, `apps/api`, and `apps/web`. Includes a database
migration because the current schema requires ABC fields that conflict with
quick capture.

## Goal

Make journaling feel fast enough that owners keep using it. A user should be
able to save a first journal entry in under 30 seconds with only a dog, a quick
plain-language note, and optional intensity. Trainer-ready structure remains
available, but it becomes progressive enrichment after the entry is already
saved instead of a prerequisite.

## Current upstream context

The latest `origin/main` already has the authenticated product shell under
`/my`, including `/my`, `/my/dogs`, `/my/journal`, `/my/brief`, trainers,
profile, settings, and admin routes. The journal implementation exists today:

- `apps/web/src/routes/journal.tsx` renders `/my/journal` with a dog selector,
  entry list, and a single long add-entry form.
- `apps/web/src/components/journal/entry-card.tsx` renders entries and repeats
  the long structured form for editing.
- `apps/web/src/lib/journal.ts` wraps typed Hono RPC hooks for
  `GET/POST/PUT/DELETE /api/dogs/:id/journal`.
- `packages/shared/src/journal.ts` requires `occurredAt`, `antecedent`,
  `behavior`, `consequence`, and `intensity`.
- `apps/api/src/routes/dogs.ts` persists journal entries through the existing
  owner-scoped dog route module.

This creates the friction the redesign addresses: entry creation requires
date/time, ABC fields, and intensity before saving, then shows location,
duration, recovery, people present, owner response, and notes in the same form.
The result is trainer-friendly but too much work for a quick moment of capture.

## Product decisions

- Primary mode: **Log a moment**. This is an incident-style quick capture flow.
- Secondary mode: **Daily check-in**. This captures a lightweight daily habit:
  better / same / harder plus a note.
- Minimum save: dog selection when needed, quick note, optional intensity.
- Post-save enrichment: after a moment is saved, offer optional follow-up
  prompts. The first prompt asks, "What happened right before?"
- Surfaces: keep `/my/journal` as the global all-dogs journal hub with dog
  filtering; support dog-specific entry points from `/my/dogs/:id`; keep `/my`
  overview quick actions pointing into the simplified flow.
- First pass input mode: text only. Leave room for voice and photos later
  without designing or building uploads now.

## Data model

The schema should match quick capture instead of storing fake ABC values.

Update `journal_entries` to support both quick moments and daily check-ins:

| Field | Change |
|---|---|
| `kind` | Add `journal_entry_kind` Postgres enum with values `moment` and `daily_checkin`. |
| `note` | Add required plain-language entry text. This is the primary displayed and edited content. |
| `intensity` | Relax to optional. For moments it may be 1-5; daily check-ins do not need it. |
| `trend` | Add optional `journal_trend` Postgres enum with values `better`, `same`, `harder`. |
| `antecedent` | Relax to optional structured detail. |
| `behavior` | Relax to optional structured detail; no longer the primary entry text. |
| `consequence` | Relax to optional structured detail. |
| Existing context fields | Keep `location`, `durationSeconds`, `recoverySeconds`, `peoplePresent`, `ownerResponse`, and `notes` as optional details behind "Add details." |

Migration behavior:

1. Add new nullable columns needed for compatibility.
2. Backfill existing rows:
   - `kind = "moment"`.
   - `note` from the best available current content, preferably a compact ABC
     summary such as `A: ... B: ... C: ...`.
   - Preserve existing ABC/context fields unchanged.
3. Make `note` required after backfill.
4. Relax `antecedent`, `behavior`, `consequence`, and `intensity` so future
   quick entries do not need placeholder values.

## Shared validation

Replace the single required-ABC `journalEntrySchema` with explicit schemas that
express the two creation modes and full edit/details mode.

- `journalMomentCreateSchema`
  - Requires `note`.
  - Requires `kind: "moment"` from the client so the API can validate a clear
    discriminated union.
  - Accepts optional `occurredAt`, `intensity`, dog context through the route,
    and optional structured/context fields.
- `journalDailyCheckInCreateSchema`
  - Requires `note` and `trend`.
  - Accepts optional `occurredAt`.
  - Requires `kind: "daily_checkin"` from the client.
- `journalEntryCreateSchema`
  - A discriminated union on `kind` across moment and daily check-in creation.
- `journalEntryUpdateSchema`
  - Supports editing quick fields and structured fields.
  - Validates intensity as an integer from 1 to 5 only when present.
  - Validates trend only for daily check-ins.

Export inferred TypeScript types through `packages/shared/src/index.ts`.

## API architecture

Keep the existing owner-scoped dog journal mutations and add a global list
endpoint for the `/my/journal` hub:

| Method | Path | Behavior |
|---|---|---|
| `GET` | `/api/journal` | List the caller's journal entries across all owned dogs, newest first. Supports optional `dogId` filter and returns a small dog summary per entry. |
| `GET` | `/api/dogs/:id/journal` | Preserve dog-specific listing for existing typed client callers and dog pages. |
| `POST` | `/api/dogs/:id/journal` | Create either a moment or daily check-in using the lightweight shared schemas. |
| `PUT` | `/api/dogs/:id/journal/:entryId` | Update quick fields or optional structured details for an entry owned through that dog. |
| `DELETE` | `/api/dogs/:id/journal/:entryId` | Unchanged owner-scoped delete. |

Rules:

- Unauthenticated requests return `401`.
- Missing or not-owned dogs and entries return `404`, preserving the existing
  no-existence-leak pattern.
- Server should set `occurredAt` to now when creation omits it.
- Server should not invent ABC values. Empty optional fields remain null.
- Behavior Brief generation should use `note` as the primary journal summary and
  include ABC fields only when present.

## Web UX architecture

Refactor `/my/journal` around focused components instead of one long form.

| Component | Responsibility |
|---|---|
| `JournalPage` | Loads dogs, selected dog/filter, entries, and creation modes. |
| `QuickMomentComposer` | Default creation flow: dog selector when needed, quick note textarea, optional intensity, Save Moment button. |
| `PostSaveFollowUps` | Non-blocking post-save prompts. Starts with "What happened right before?" and allows Answer, Skip, or Done. |
| `DailyCheckInComposer` | Secondary creation flow for better/same/harder plus note. |
| `JournalEntryCard` | Displays note first with dog/date/kind/intensity metadata; expands for structured details. |
| `StructuredDetailsEditor` | Full add-details/edit surface for ABC and context fields. Reused after save and for existing entries. |

Primary flow:

1. User chooses **Log moment** from `/my`, `/my/journal`, or a dog page.
2. If exactly one dog exists, it is preselected. If multiple dogs exist, dog
   selection is shown before saving.
3. User writes a quick note and optionally chooses intensity.
4. Save creates the entry immediately and clears the composer.
5. The new entry appears in the timeline.
6. The page shows the first optional prompt: "What happened right before?"
7. User can answer, skip, or close prompts. The entry remains saved either way.

Daily check-in flow:

1. User switches to or opens **Daily check-in** from `/my/journal`.
2. User chooses better, same, or harder and writes a short note.
3. Save creates a `daily_checkin` entry in the same timeline.

## Route and navigation behavior

- `/my/journal` remains the global journal hub.
- `/my` overview keeps a quick action for logging behavior, pointing into the
  quick composer.
- Dog detail pages should provide a dog-specific entry point that links to
  `/my/journal?dogId=<id>` and preselects that dog. Do not create a separate
  dog-only journal route in this scope.
- Existing `/my/journal` route and shell navigation remain stable.

## Error handling

- **No dogs:** show a friendly empty state with an action to `/my/dogs/new`.
- **Quick save validation:** block only missing dog or empty note.
- **Save failure:** keep the user's note in the composer, show a localized
  failure toast/message, and do not clear the form.
- **Follow-up failure:** keep the saved entry visible, show the failed prompt as
  retryable, and do not imply the entry failed.
- **Edit failure:** keep edited values visible and show the existing localized
  save failure behavior.
- **Server ownership failures:** keep existing 404 behavior for missing/not-owned
  dogs and entries.

## Localization

All new strings go through typed i18n in both English and Spanish. Add keys for:

- Log moment
- Quick note
- Optional intensity
- Save moment
- Daily check-in
- Better / same / harder
- Add details
- Post-save prompt labels and actions
- Empty/error states introduced by the simplified flow

Use the existing Spanish product vocabulary, including "diario de conducta" for
behavior journal.

## Testing and verification

Add or update tests at the smallest useful scope:

- **Shared:** schema tests for moment create, daily check-in create, update with
  optional ABC/context, invalid intensity, invalid trend, and empty note.
- **API:** owner-scoped journal list/create/update/delete; note-only moment
  creation; daily check-in creation; optional follow-up update; 401/404
  behavior; Behavior Brief generation with note-only entries.
- **Web:** `/my/journal` renders quick composer; note-only save submits and
  clears; saved entry appears note-first; post-save prompt can be answered and
  skipped; daily check-in saves; no-dog state links to add dog.
- **i18n:** English/Spanish parity remains green.
- **Migration:** existing ABC entries are backfilled into `note` and remain
  visible with their structured details.

Use the repo's existing scripts and targeted package commands. Do not add new
test tooling.

## Out of scope

- Voice dictation, audio upload, photo upload, or attachments.
- AI summarization or automatic ABC extraction.
- Trainer directory changes.
- Behavior Brief visual redesign beyond ensuring it reads note-first journal
  entries correctly.
- Replacing the `/my` app shell or navigation.
- Building a separate dog-only journal route; use the filtered global page for
  this scope.

## Implementation decisions

- Use Postgres enums for `journal_entry_kind` and `journal_trend`, matching the
  repository's existing enum style.
- Use `journalEntryCreateSchema` as a discriminated union on `kind` for `POST
  /api/dogs/:id/journal`.
- Use `journalEntryUpdateSchema` for `PUT /api/dogs/:id/journal/:entryId` so
  optional follow-up/detail edits do not have to resubmit a full creation body.
