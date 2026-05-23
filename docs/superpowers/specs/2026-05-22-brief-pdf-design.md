# TuringCare — Behavior Brief downloadable branded PDF

**Date:** 2026-05-22
**Status:** Shipped.
**Implementer:** Claude Code (parallel PR from `feat/brief-pdf` off `origin/main`).
**Scope:** Web-only. Add a "Download PDF" control to the Behavior Brief page
(`apps/web/src/routes/brief.tsx`) that produces a branded TuringCare PDF of the
brief. Strictly additive — the existing Print + Copy actions are untouched. No
API endpoints, no DB changes.

## Goal

The Behavior Brief is the MVP's keystone deliverable, but until now it could
only be printed or copied as plain text. Trainers and owners want a clean,
branded, shareable artifact. This adds a one-click downloadable PDF rendered
entirely client-side from data already on the page.

## What / where

1. **Pure model builder** — `apps/web/src/lib/brief-pdf-model.ts`
   `buildBriefPdfModel({ brief, dog, now?, locale? }) → BriefPdfModel`. Maps the
   brief (`{ generatedAt, status, summary, version }`) plus the dog row
   (`{ name, breed, dateOfBirth, size, sex }`) into a flat, serializable model:
   `brandName, title, dogName, breed, ageYears, age, size, sex, status, version,
   generatedAt` (formatted via `Intl.DateTimeFormat`), `summary`, and a safe
   `fileName` slug (`behavior-brief-<slug>.pdf`). Age is derived from DOB
   (whole-year "N yr", else "N mo"). All optional fields degrade to `null`; an
   absent dog yields `dogName: "Unknown"`. No React / @react-pdf imports — fully
   unit-testable. `now` is injectable for deterministic date/age tests.

2. **PDF document component** — `apps/web/src/components/brief-pdf-document.tsx`
   `BriefPdfDocument({ model })` using `@react-pdf/renderer` primitives
   (`Document`, `Page`, `View`, `Text`, `StyleSheet`). Branded header
   ("TuringCare" with copper accent + copper rule), a white dog-profile card
   (name + breed/age/size/sex meta + status pill), the summary section, and a
   fixed footer with brand + version + generated date. Brand palette hardcoded
   to mirror `src/index.css` tokens (cream/slate/slate-soft/silver/copper).
   Default fonts only — no external font/image assets to avoid loader failures.

3. **Download control** — `apps/web/src/components/brief-download-button.tsx`
   wraps `@react-pdf/renderer`'s `PDFDownloadLink` + `BriefPdfDocument` +
   `buildBriefPdfModel`, styled with `buttonVariants({ variant: "outline" })`
   for visual parity with the other brief buttons. It is **lazy-loaded** in
   `brief.tsx` via `React.lazy` + `Suspense` so the heavy @react-pdf bundle
   (~1.5 MB) is code-split out of the main app chunk and only fetched when a
   brief is shown.

4. **brief.tsx** — looks up the dog from the existing `useDogs()` list, renders
   the lazy `<BriefDownloadButton brief dog />` inside a `<Suspense>` (fallback:
   a disabled "Preparing PDF…" button) next to Print/Copy.

5. **i18n** — added `brief.downloadPdf` and `brief.preparingPdf` to both
   `en.ts` ("Download PDF" / "Preparing PDF…") and `es.ts` ("Descargar PDF" /
   "Preparando PDF…"), preserving the compile-time en/es parity guard.

## Decisions

- **Concerns/goals excluded from the PDF.** The brief page only loads
  `useDogs()` (list) + `useBrief()`; concerns/goals come from `useDog(:id)`
  which this page does not call. Per "only fields actually available", the PDF
  renders the dog profile + the brief summary (which already textually contains
  concerns/goals/journal from the server composer). No new fetches added.
- **@react-pdf/renderer dependency.** It was already in the monorepo lockfile as
  a dep of `apps/api` (`^4.1.0`, resolved 4.5.1) but absent from `apps/web`.
  Added the same `^4.1.0` specifier to `apps/web/package.json`; `pnpm install`
  reused the existing lockfile resolution (3-line lockfile diff, no new external
  package pulled). This is the dep the spec intended to use, not a new one.
- **Code-splitting.** Lazy-loading the PDF control keeps @react-pdf off the
  critical path — it would otherwise add ~1.5 MB to every page's main chunk.

## Test plan

- **`brief-pdf-model.test.ts`** (TDD, written first, observed red): maps fields,
  computes age in years and months, formats `generatedAt`, handles missing
  optional dog fields, falls back to "Unknown" with no dog, slugifies filename.
- **`brief-pdf-document.test.tsx`**: asserts `BriefPdfDocument({ model })`
  constructs a valid React element without throwing (full + sparse model).
  jsdom cannot render real @react-pdf to PDF bytes, so byte output is not
  asserted.
- **`brief.test.tsx`**: extended to assert the "Download PDF" link renders with
  the per-dog `download` filename. `PDFDownloadLink` throws "web specific API"
  under jsdom (Node build), so the lazy `@/components/brief-download-button`
  module is `vi.mock`ed to a plain anchor whose filename is computed by the real
  `buildBriefPdfModel` — keeping the assertion meaningful.

## Gate

biome clean · `tsc --noEmit` clean · web tests 76 pass (26 files) · build green.
