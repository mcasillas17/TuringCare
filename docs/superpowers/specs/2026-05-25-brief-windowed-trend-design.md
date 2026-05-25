# Windowed, trend-aware behavior brief — design

**Date:** 2026-05-25
**Status:** Approved (design)

## Problem

After the journal quick-capture redesign (#35), entries are stored differently:
`note` (required) is now the primary content, the ABC fields
(`antecedent`/`behavior`/`consequence`) and `intensity` are optional, and daily
check-ins carry a `trend` (`better` / `same` / `harder`). Two consequences for
the behavior brief (`apps/api/src/lib/brief.ts` + `POST /api/dogs/:id/brief`):

1. **The brief ignores the new `trend` signal entirely.** Daily check-ins record
   a clear better/same/harder read, but the brief drops it (and `kind`), so a
   check-in and a moment look identical in the output.
2. **The brief has no time window.** The query pulls *every* entry the dog has
   ever had (no `WHERE` on date, no `LIMIT`), averages intensity over all of it,
   then lists only the 5 most recent. The headline average and the visible
   entries describe different time spans, and now that quick-capture makes
   logging frictionless, a lifetime average increasingly hides recent progress —
   exactly what a brief exists to show.

The brief is a deterministic text template (no LLM). This design keeps it so.

## Goal

Make the brief recency-aware and trend-aware:

- Scope generation to a chosen window: **7 / 30 / 90 days or All**, default **30**.
- Surface the daily check-in trend as a plain tally over the window.
- Raise the listed-entries cap from 5 to 10.

Non-goals: no LLM generation, no schema/migration changes, no change to the
email-a-brief send flow, no per-concern or per-behavior grouping.

## Approach

**Window as a request param, filtered in the SQL query.** Rejected alternatives:

- *Filter in-memory inside `composeBrief`* — would keep pulling all rows forever
  as history grows; filtering belongs in the query.
- *Persist the window on the `briefs` row (new column)* — YAGNI. The composed
  text already states its own window, and briefs are immutable text snapshots.

## Design

### 1. Shared schema — `packages/shared/src/brief.ts`

Add a generate-request schema:

```ts
export const briefGenerateSchema = z.object({
  window: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
});
```

An enum (rather than a nullable day count) avoids the "omitted = 30 but null =
all" ambiguity. An omitted/empty body defaults to `30d`.

### 2. API route — `apps/api/src/routes/dogs.ts`, `POST /:id/brief`

- Parse the body with `briefGenerateSchema`.
- Map `window` → a cutoff `Date` (`now - N days`), or no cutoff for `"all"`.
- Add the date filter to the existing journal query:

```ts
const where =
  window === "all"
    ? eq(journalEntries.dogId, dog.id)
    : and(
        eq(journalEntries.dogId, dog.id),
        gte(journalEntries.occurredAt, cutoff),
      );
```

- Pass `kind`, `trend`, and a human `windowLabel` (e.g. `"the last 30 days"`,
  or `"all time"`) through to `composeBrief`. The existing `select()` already
  returns `kind` and `trend`.

### 3. Brief composer — `apps/api/src/lib/brief.ts`

- Extend `BriefInput.entries` items with `kind: "moment" | "daily_checkin"` and
  `trend?: "better" | "same" | "harder" | null`; add `windowLabel: string` to
  `BriefInput`.
- **Journal line** carries the window and keeps the existing average:
  `Journal: 23 entries in the last 30 days, average intensity 2.8.`
  All-time → `Journal: 23 entries (all time), average intensity 2.8.`
  Average is computed over all entries in the window (which, post-filter, is all
  entries passed in). When no entry has an intensity:
  `… average intensity not recorded.` (unchanged wording).
- **Check-ins line** — shown only when ≥1 daily check-in exists in the window,
  immediately after the Journal line:
  `Check-ins: 5 better, 2 same, 1 harder.`
  Tally over `entries` where `kind === "daily_checkin"`, grouped by `trend`.
  Zero check-ins ⇒ omit the line entirely.
- **Listed entries**: raise `slice(0, 5)` → `slice(0, 10)`. Each line keeps its
  current shape (`- YYYY-MM-DD: note (intensity N) — A: … B: … C: …`), with the
  optional pieces rendered only when present.
- Title stays clean (`Behavior Brief — {name}`); the window appears in the
  Journal line, not the title, to avoid repeating it.

### 4. Web UI

A segmented control (`7d / 30d / 90d / All`, default `30d`) on the existing
brief-generate panel. The selected value is posted with the generate/regenerate
mutation. New `en`/`es` i18n keys for the four labels (+ an accessible group
label). The exact web component file is identified during planning (the web
brief panel was not located during design).

### 5. Tests

- `brief.ts` unit (`apps/api`): trend tally; 10-entry cap; windowed vs all-time
  Journal line; zero-check-ins omits the Check-ins line; average over the window.
- Route test: `window` filters by `occurredAt`; omitted body ⇒ `30d`.
- Web: the selector passes the chosen window into the generate mutation.

### 6. Compatibility / no-change

- **No migration.** Existing finalized briefs are stored text and are untouched.
- **Email-a-brief unchanged.** `POST /:id/brief/send` reuses the stored
  `brief.summary`, so it automatically inherits whatever window was generated.

## Edge cases

- **Empty window**: `Journal: 0 entries in the last 7 days.`, Check-ins line
  omitted, brief still generates (concerns / goals / progress unaffected).
- **`all`**: no date filter; label `all time`.
- **Trend integrity**: moments cannot carry `trend` (DB CHECK constraint), so the
  tally is naturally check-ins-only without extra guarding.
- **Timezone**: cutoff is `now - N×24h` in UTC against the stored `occurredAt`
  timestamp. Acceptable for a human-readable brief; no per-user TZ handling.
