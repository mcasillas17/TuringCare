# TuringCare — Behavior Journal: edit + 4 missing capture fields

**Date:** 2026-05-21
**Status:** Approved (user picked "Edit + 4 missing capture fields" slice; "Inline
expand + edit-in-place" UX). Ready for plan.
**Scope:** Extend the per-dog ABC log with (a) a PUT endpoint to update an entry,
(b) the four nullable `journal_entries` columns that already exist in the DB
schema but aren't surfaced in the API or UI (`durationSeconds`, `recoverySeconds`,
`peoplePresent`, `ownerResponse`), and (c) an inline-expand / edit-in-place UX.
No DB migration, no new deps, no backend infra changes.

## Goal

Today the journal supports ADD / LIST / DELETE per-dog (ABC + intensity + optional
`location`/`notes`). Mistyped entries are unfixable — there's no PUT. The four
columns the DB was designed to capture (`durationSeconds`, `recoverySeconds`,
`peoplePresent`, `ownerResponse`) are never surfaced. This sub-project:

1. Adds **PUT `/api/dogs/:id/journal/:entryId`** to the API (owner-scoped + double-
   scoped by `dogId`, mirroring the existing DELETE pattern at
   `apps/api/src/routes/dogs.ts:138`).
2. Extends `journalEntrySchema` with the four fields — all nullable + optional,
   matching the DB column nullability.
3. Reworks `journal.tsx` into a list of compact rows where clicking a row expands
   a card to show all 11 capture fields, and a pencil affordance toggles into
   edit-in-place mode (RHF + `zodResolver` pre-populated from the entry; Save /
   Cancel pair).
4. Extends the create-form with the four new optional fields (no progressive
   disclosure — shown by default with an "optional" hint).
5. Adds ~11 i18n keys to en/es with parity, plus a new `entry-card.test.tsx`
   component test covering the three modes (collapsed / expanded / editing).

## What changes (full inventory)

### Shared (1 file):

- `packages/shared/src/journal.ts` — extend `journalEntrySchema`:
  - `durationSeconds: z.number().int().nonnegative().nullable().optional()`
  - `recoverySeconds: z.number().int().nonnegative().nullable().optional()`
  - `peoplePresent: z.string().nullable().optional()` (free-text — who was present)
  - `ownerResponse: z.string().nullable().optional()` (what the owner did)
  - `JournalEntryInput` regenerates from inference; existing callers stay valid
    (the four fields are all optional).

### API (2 files):

- `apps/api/src/routes/dogs.ts` — two edits to the chained `dogsApp`:
  1. The existing **POST `/:id/journal`** handler (lines 114–132) extended to
     write the four new fields with `?? null` each, preserving the rest of the
     insert.
  2. **NEW PUT `/:id/journal/:entryId`** handler inserted between the existing
     POST and DELETE. Pattern: `findOwnedDog → 404`; if found, run
     `db.update(journalEntries).set({…validated, occurredAt: new Date(b.occurredAt)})`
     with `where(and(eq(journalEntries.id, c.req.param("entryId")), eq(journalEntries.dogId, dog.id)))`
     (the same double-scope used by the DELETE at line 138 — proves cross-dog
     mutation is impossible). Uses `zValidator("json", journalEntrySchema)`.
     Returns `{ entry }`. Chain stays one expression — `AppType` infers the new
     path automatically and propagates to the hono client.
  3. GET and DELETE unchanged.

- `apps/api/test/dogs.test.ts` — new test cases:
  - PUT happy-path round-trip (sets + reads back all four new fields).
  - PUT owner-isolation: user B PUT against user A's entry → 404 (no existence
    leak).
  - PUT 400 on invalid `intensity` (out of 1–5 range).
  - PUT 404 on a cross-dog `entryId` belonging to a different dog of the same
    user (verifies the double-scope).
  - POST extended assertion that the four new fields persist when supplied.

### Web (5 files):

- `apps/web/src/lib/journal.ts` — add `useUpdateEntry(dogId)`:
  ```ts
  export function useUpdateEntry(dogId: string) {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: async (args: { entryId: string; body: JournalEntryInput }) => {
        const res = await j[":entryId"].$put({
          param: { id: dogId, entryId: args.entryId },
          json: args.body,
        });
        if (!res.ok) throw new Error("update_failed");
        return (await res.json()).entry;
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["journal", dogId] });
        qc.invalidateQueries({ queryKey: ["overview"] });
      },
    });
  }
  ```

- `apps/web/src/components/journal/entry-card.tsx` — **NEW.** Per-entry component.
  - Props: `{ entry, dogId }`.
  - Local state: `mode: "collapsed" | "expanded" | "editing"` via `useState`.
  - **Collapsed (default):** Row is a `<button>` (or div with `role="button"`)
    showing timestamp · `t("journal.intensity")` · `A:`/`B:`/`C:` lines · `✕`
    delete control. Whole row (the outer `<button>`/`role="button"` element)
    is the toggle to expand. **All nested interactive children** (delete `✕`,
    pencil `✎`, form inputs/buttons in editing mode) call
    `event.stopPropagation()` so clicking them never re-toggles the row.
    `aria-label={t("journal.expand")}`.
  - **Expanded:** Same row content + a panel showing ALL 11 capture fields
    (`occurredAt`, `antecedent`, `behavior`, `consequence`, `intensity`,
    `location`, `notes`, `durationSeconds`, `recoverySeconds`, `peoplePresent`,
    `ownerResponse`). Blanks render as `—` so the layout doesn't shift between
    entries with/without optional fields. Pencil button (`✎`) toggles into
    editing; ✕ still deletes (with `stopPropagation`). Row click collapses back;
    `aria-label={t("journal.collapse")}`.
  - **Editing:** Replaces the read-only panel with an RHF form using
    `useForm<JournalEntryInput>({ resolver: zodResolver(journalEntrySchema) })`,
    `reset()`-populated from the current entry (string dates pre-formatted for
    `<input type="datetime-local">`). Save button is `t("journal.update")`;
    Cancel button is `t("journal.cancel")`. On Save: `updateEntry.mutateAsync({ entryId, body }) → toast.success(t("journal.savedEdit"))` and set mode back to
    `"expanded"`; on failure: `toast.error(t("journal.saveFailed"))` and STAY in
    editing mode (user's input is preserved — no `reset` on error). Cancel
    discards changes and returns to expanded.

- `apps/web/src/routes/journal.tsx` — shrink to a list-shell + extended create-form:
  - Inline `<li>…</li>` block (lines 60–76) replaced with
    `{entries?.map(e => <EntryCard key={e.id} entry={e} dogId={selected} />)}`.
  - Create-form (lines 79–132) gains four new fields below `notes`:
    - **Duration** — `<input type="number" min="0" {...register("durationSeconds", { valueAsNumber: true, setValueAs: v => (v === "" || Number.isNaN(v)) ? undefined : v })} />` with label `t("journal.duration")` + hint `t("journal.optional")`.
    - **Recovery** — same shape with `register("recoverySeconds", …)` and label `t("journal.recovery")`.
    - **People present** — `<input type="text" {...register("peoplePresent", { setValueAs: v => v || undefined })} />` with label `t("journal.peoplePresent")` + hint.
    - **Owner response** — `<textarea rows={2} {...register("ownerResponse", { setValueAs: v => v || undefined })} />` with label `t("journal.ownerResponse")` + hint.
  - No progressive-disclosure UI (all fields visible). The optional hint is a
    small muted-text suffix on the label.

- `apps/web/src/components/journal/entry-card.test.tsx` — **NEW.** Three tests:
  - `renders collapsed by default; clicking row expands and reveals all 11
    fields` — stub entry with values in all four new fields; assert their
    rendered text appears in the expanded view (and not before).
  - `clicking pencil enters editing mode with the form pre-populated` —
    assert form inputs exist with the entry's current values.
  - `save flow PUTs and returns to expanded with the new value rendered` —
    stub `fetch` to capture the PUT URL/body and respond with the updated
    entry; assert the row re-renders with the edited text.

- `apps/web/src/routes/journal.test.tsx` — minor update to keep the existing
  "renders existing entries" test passing against the new `<EntryCard>` shape.
  The existing assertion on `screen.getByText(/Lunged at door/)` continues to
  pass because EntryCard renders the behavior line in collapsed mode.

### i18n (2 files):

- `apps/web/src/i18n/en.ts` — extend the `journal:` section with 11 new keys
  (insertion order non-load-bearing — `Messages` parity is structural):
  - `expand: "Expand entry"` (aria-label)
  - `collapse: "Collapse entry"` (aria-label)
  - `edit: "Edit"` (button)
  - `update: "Save changes"` (Save button while editing)
  - `cancel: "Cancel"` (button)
  - `duration: "Duration (seconds)"`
  - `recovery: "Recovery (seconds)"`
  - `peoplePresent: "People present"`
  - `ownerResponse: "Your response"`
  - `optional: "optional"` (hint suffix on optional-field labels)
  - `savedEdit: "Entry updated"` (toast on successful PUT)

- `apps/web/src/i18n/es.ts` — corresponding keys:
  - `expand: "Expandir entrada"`
  - `collapse: "Contraer entrada"`
  - `edit: "Editar"`
  - `update: "Guardar cambios"`
  - `cancel: "Cancelar"`
  - `duration: "Duración (segundos)"`
  - `recovery: "Recuperación (segundos)"`
  - `peoplePresent: "Personas presentes"`
  - `ownerResponse: "Tu respuesta"`
  - `optional: "opcional"`
  - `savedEdit: "Entrada actualizada"`

The compile-time `es satisfies Messages` parity check enforces all 11 keys exist
in both files; the existing runtime no-untranslated test continues to catch any
literal English in the `es` catalog.

### Documentation (1 file):

- `docs/PROJECT-LOG.md` — append a shipped entry at the bottom (date 2026-05-21,
  matching the file's tail-append convention).

### Out of inventory (intentionally NOT touched)

- **DB migration** — all four target columns already exist in `journal_entries`
  (`durationSeconds INTEGER`, `recoverySeconds INTEGER`, `peoplePresent TEXT`,
  `ownerResponse TEXT`, all nullable). Zero schema change.
- **Brief composition** (`apps/api/src/lib/brief.ts`) — currently uses only
  `behavior`/`intensity`/`occurredAt`. NOT extended in this PR. Folding the
  new fields (especially `ownerResponse`) into Brief output is a separable
  follow-up (one small task).
- **Filter, search, charts, attachments, tags, per-dog inline journal,
  quick-capture/voice** — all future slices.
- **No new deps** — `react-hook-form` and `@hookform/resolvers/zod` are already
  in `package.json` (used by the existing create-form).
- **No infra/env/cookie/CORS/Fly changes.**
- `/login`, `/register`, `/`, `/admin`, and every other route untouched.

## Approved change (architecture in one paragraph)

Extend the shared schema with four nullable optional fields; add a new PUT
handler to the chained Hono `dogsApp` matching the existing CRUD pattern
(`findOwnedDog → 404`, double-scoped `where`, `zValidator`); add `useUpdateEntry`
to the journal hooks file; extract per-entry rendering into a new `<EntryCard>`
component that owns `collapsed/expanded/editing` state internally, with edit-mode
using RHF + `zodResolver` and a Save/Cancel pair; the create-form gains four
optional inputs visible by default with an "optional" hint; eleven new i18n keys
with en/es parity; one new component test file plus extended API tests.

## Testing / verification

After implementation:

- `pnpm -r exec tsc --noEmit` → 0 (the four new fields propagate via shared
  schema inference; the new PUT propagates via Hono `AppType`).
- `pnpm -r test` → all green. New test deltas:
  - shared: schema tests for the four new field types.
  - api: five new cases (PUT happy-path, owner-isolation, 400 invalid intensity,
    cross-dog 404, POST persists new fields).
  - web: three new `entry-card.test.tsx` cases; existing `journal.test.tsx`
    continues to pass.
- `pnpm -r build` → succeeds.
- `pnpm lint` → 0.

## Old-data backfill

**Not needed.** All four new columns are already nullable in the DB; existing
entries have them as `NULL` and the GET/PUT handlers read them as such. The
expanded card renders `—` for nulls so the UI stays consistent. No SQL backfill.

## Out of scope

- Brief generator changes (separable follow-up).
- Filter, search, charts, attachments, tags, voice/quick-capture, per-dog inline
  journal — future slices.
- API/CORS/cookie domain. Marketing pages. Admin.
- `/login`, `/register`, `/`, `/admin` — unchanged.
- **Single-active-edit enforcement** — see flagged decisions.

## Flagged decisions (reasonable; reviewable)

- **Single-active-edit not enforced.** Per-card local state. Multiple cards can
  be expanded/editing simultaneously. Trade-off: simpler component, no prop
  drilling, no global state — but if the user accidentally opens two editors
  there are two independent forms. No data risk (saves are scoped by `entryId`).
  Enforcing single-active would require lifting `expandedId`/`editingId` to
  `journal.tsx` and threading via props — accepting the trade-off.
- **All create-form fields visible by default.** No "More details ▾" disclosure.
  YAGNI; the four new fields are marked `optional` via a hint suffix on the
  label. Can add disclosure later if the form grows noisy.
- **Brief composer unchanged.** It uses only `behavior`/`intensity`/`occurredAt`
  today. The new `ownerResponse` (and the duration/recovery numbers) might
  improve Brief composition, but adding them is a separable concern with its
  own taste decisions about wording. Tracked for a follow-up.
- **`peoplePresent` is free-text**, not normalized into a separate `people`
  table. MVP simplicity. Restructure later only if structured queries become
  useful (e.g., "show all entries when the dog walker was present").
- **No edit history / versioning.** Updates overwrite. Same as the existing
  dog-profile PUT — consistent with the pattern across the codebase.
- **Row-click to toggle expand** (not a dedicated chevron). Delete and pencil
  controls use `stopPropagation` to avoid double-triggering. Trade-off: the
  whole row is interactive — the alternative (a dedicated chevron button) is
  more conventional but adds a separate hit target; row-click is faster.
