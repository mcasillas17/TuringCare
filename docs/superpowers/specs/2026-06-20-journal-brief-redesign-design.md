# Journal & Brief Redesign — Design

**Date:** 2026-06-20
**Status:** Approved (design), pending spec review
**Scope:** Frontend-only UX redesign of the Behavior Journal and Behavior Brief in `apps/web`.

## Problem

The journal and brief work functionally but feel "awful to use." Direct review of the live
journal screen and the code confirmed two overlapping failures:

**Looks unfinished.** Raw machine timestamps (`2026-06-21 04:46`), every entry rendered as a
tall white box with nothing but text and a lone "Remove" button, no day grouping, no visual
hierarchy, intensity buried in a metadata string, large dead whitespace. Reads like a database
admin panel, not a product someone opens daily.

**Clunky to use.** Structured ABC fields (antecedent/behavior/consequence) are hidden — only
reachable by saving an entry, expanding it, then "Edit details." Intensity takes two steps
("+ Add intensity", then drag). A post-save dialog nags with Answer/Skip/Done (two near-identical
buttons). You can't backdate an entry while writing it. The brief is a 5–6 step gauntlet (dog →
window → Generate → Finalize → email → Send) where **Finalize is a hidden gate** that silently
disables email, and the share-link-vs-email choice is unexplained with no preview of what the
trainer receives.

## Goals

- **Phone-first capture.** Owners log in the moment, one-handed. Capture must be fast and
  thumb-friendly; desktop is a clean responsive scale-up, not the primary target.
- **Look like a real product.** Humanized times, day grouping, clear hierarchy, compact scannable
  rows, one consistent tile/sheet visual language across journal and brief.
- **Remove the friction** enumerated above without losing any existing capability (ABC capture,
  intensity, trend, backdating, brief windows, finalize, email, share link, PDF).

## Non-goals

- No backend/schema/API changes. The data model already supports everything below (moments,
  check-ins, intensity, ABC + location/duration/etc., editable `occurredAt`, brief windows,
  finalize, share token, email send). This is a presentation-layer redesign.
- No new entry types, no new brief content, no notifications, no auth changes.
- Not touching the This Week tab, training, or dog-hub layouts beyond shared styling.

## Design language (shared)

A single visual vocabulary used by both features and matching the existing app palette:

- **Tiles** — full-width, rounded, icon + bold label + one-line subtext. Primary tile is dark
  (`#1f2430` on `#fff` text); secondary tiles are white with a `#d8d2c2` border.
- **Sheets** — focused capture/share surfaces with a title + close affordance, opened from a tile.
- **Timeline rows** — compact: a small colored status dot, the note text, a humanized meta line.
- **Humanized time** — "Today · 4:46 AM", "Yesterday", "Jun 1", grouped under uppercase day labels.
- **Status pills** — intensity (`intensity 3`, amber), trend (Better=green / Same=grey /
  Harder=red), brief status (Draft=grey / Final=green).

## Journal redesign (Direction B)

### Home (`JournalView`)
- Title + a small summary line (e.g. "23 moments · 4 check-ins").
- Two **big tiles**: **＋ Log a moment** (primary) and **📋 Daily check-in** (secondary). Each
  opens its own sheet. This replaces the current inline Log-moment/Daily-check-in segmented toggle.
- Below: the **timeline**, grouped by day with uppercase day labels. Each entry is a compact row:
  status dot + note + humanized meta (`4:46 AM · Moment`, intensity pill if set, trend badge for
  check-ins). Tapping a row opens it for view/edit; **Remove lives inside the opened row**, not as
  a persistent button on every row.
- Multi-dog: the dog selector stays (the screenshot's "All dogs"); each row shows the dog name when
  viewing All dogs. When scoped to one dog, the selector is hidden.

### Log a moment sheet (`QuickMomentComposer` → sheet)
- Auto-focused **"What happened?"** textarea (the only required field).
- **Intensity**: a 1–5 row of tappable dots, optional, **single tap to set** (no "+ Add intensity"
  pre-step), tap again to clear.
- **Time chip** "🕐 Now" — tap to backdate via a date/time picker, **before** saving.
- **"＋ Add place"** chip (location) and an **"＋ Add detail"** expander that reveals the structured
  ABC fields (antecedent / behavior / consequence + duration / recovery / people / owner response /
  notes) inline while composing.
- **Save moment** button. **No post-save follow-up dialog** — detail is available inline, so the
  nag is removed entirely.

### Daily check-in sheet (`DailyCheckInComposer` → sheet)
- **Better / Same / Harder** segmented control (Same default), shown big.
- Note textarea ("How did today go?").
- Time chip "🕐 Today" (backdatable).
- **Save check-in**.

### Entry view/edit (`EntryCard`, `StructuredDetailsEditor`)
- Reuse the existing structured editor, restyled to match the sheet language, opened by tapping a
  timeline row rather than a two-step expand→edit. Moment vs check-in show their relevant fields
  (already the case). `occurredAt` editable here too.

## Brief redesign (A+B hybrid)

### Review screen (`brief.tsx`)
- Header: "Behavior Brief" + a **status pill** (Draft · v{n} / Final · v{n}).
- **Period chips** (7d / 30d / 90d / All) directly on screen, 30d default; changing the period
  regenerates the preview.
- The brief rendered as a **formatted document preview** (Summary, Working on, Trend, Recent
  moments) — not a raw text blob — with a humanized "generated Jun 21" line. This is exactly what
  the trainer will receive (preview-fidelity).
- One bold full-width **"Share this brief ▸"** primary action. (PDF download also reachable here.)

### Share screen / sheet
- An amber **explainer note**: sharing **finalizes this as v{n}** so the trainer always sees the
  same thing; you can regenerate a new version later. This makes the old hidden Finalize gate
  explicit and folds it into the share action.
- Three **big option tiles**, each with a one-line "when to use this":
  - **✉️ Send to your trainer** (primary) — email with a personal note (`SendPanel` content,
    restyled; recipient + optional message).
  - **🔗 Copy a private link** — view-only share link; create/copy/revoke (existing share token).
  - **⬇️ Download PDF** — existing `@react-pdf/renderer` export.
- Tapping a tile that requires finalize will finalize first (single confirm via the explainer),
  removing the separate mandatory Finalize button.

## Components affected (frontend only)

- `apps/web/src/components/journal/journal-view.tsx` — tiles + grouped timeline + sheet hosting.
- `apps/web/src/components/journal/quick-moment-composer.tsx` — sheet, one-tap intensity, time
  chip, inline "Add detail" (ABC) + "Add place".
- `apps/web/src/components/journal/daily-check-in-composer.tsx` — sheet, big segmented trend, time.
- `apps/web/src/components/journal/entry-card.tsx` — compact row, tap-to-open, internal remove.
- `apps/web/src/components/journal/post-save-follow-ups.tsx` — **removed** (no more nag).
- `apps/web/src/components/journal/structured-details-editor.tsx` — restyled, reused inline + edit.
- New shared helpers: humanized-time / day-grouping util (e.g. `lib/when.ts`) and small
  presentational pieces (timeline row, status dot, intensity dots, segmented control, sheet, tile).
- `apps/web/src/routes/brief.tsx` — review screen with period chips + document preview + share.
- `apps/web/src/components/brief/send-panel.tsx` — folded into the ✉️ share tile, restyled.
- `apps/web/src/components/brief-download-button.tsx` — reached from the ⬇️ tile (unchanged logic).
- i18n: new/renamed keys in `apps/web/src/i18n/en.ts` + `es.ts` (humanized labels, tile copy, share
  explainer, day labels). Parity test must stay green (es values differ from en).

## Data flow

No change. Existing hooks remain the source of truth: `useJournal`/`useAddEntry`/`useUpdateEntry`/
`useDeleteEntry`, and `useBrief`/`useGenerateBrief`/`useFinalizeBrief`/`useShareBrief`/
`useRevokeShare`/`useSendBrief`. The redesign re-arranges how these are surfaced; payloads are
unchanged (intensity, trend, ABC, `occurredAt`, window, recipient/message all already supported).

## Responsive / accessibility

- Mobile-first layout; tiles and sheets are full-width on phone and constrained-width on desktop.
- Tap targets ≥ 44px. Segmented controls and intensity dots are real buttons with labels.
- Sheets are dismissible (close button + backdrop/ESC). Time pickers use native inputs.
- Keep react-doctor accessibility checks green.

## Testing

- Journal: logging a moment (note only), with one-tap intensity, with backdated time, with ABC via
  "Add detail"; logging a check-in with each trend; editing and removing from a row; day-grouping
  and humanized-time rendering; multi-dog vs scoped.
- Brief: period switch regenerates; share screen finalizes on first share; email send; create/copy/
  revoke link; PDF download still works; humanized generated date.
- i18n parity test green; full web vitest + tsc + biome clean.

## Out of scope / follow-ups

- Dog profile photos on timeline rows (separate backlog item).
- Search/filter of journal entries; richer brief content; swipe-to-delete gestures (optional later).
