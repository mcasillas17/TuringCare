# End-to-end localization design

**Date:** 2026-08-23
**Status:** Implemented and dual-review clean; published as PR #70
**Scope:** English/Spanish locale resolution, shared catalogs, localized web/admin UI,
API-served training content, generated Briefs, PDFs, and transactional emails.

## Goal

Make one explicit locale follow a person through TuringCare. A signed-in account choice
must beat a browser-local choice; a browser-local choice must beat automatic browser
detection; English is the final fallback. User-visible system copy must resolve from
catalog keys rather than English literals at the rendering or generation site.

## Architecture

Create `@turingcare/i18n`, a framework-neutral workspace package containing the supported
locale allowlist, English and Spanish catalogs, i18next instance factories, and server
translation helpers. The web app retains its existing `LocaleProvider`, `useI18n()`, and
typed `t("section.key")` facade so feature components do not churn, but the facade is
backed by i18next and `react-i18next`. The API uses the same catalogs through i18next core.

A Hono locale middleware validates `X-TuringCare-Locale` against exactly `en` and `es`,
then falls back to a supported `Accept-Language` value and finally `en`. It attaches the
locale to request context and emits `Content-Language`. The web API and auth clients add
the current explicit locale header. Invalid or missing headers are not errors and never
reach a template or database sink as arbitrary strings.

## Preference resolution and persistence

The web resolves locale in this order:

1. Nullable authenticated `user.locale`, when present.
2. A valid `tc-locale` value in local storage.
3. A supported language in `navigator.languages` / `navigator.language`.
4. English.

`user.locale` is a nullable `locale` enum so existing accounts retain browser detection
until they make or synchronize a choice. An authenticated locale bridge loads the profile:
an existing account locale is adopted without treating it as a new user action; when it is
null, the already-resolved browser locale is saved once. Later explicit toggles update both
local storage and the account. Failed account persistence leaves the local selection usable
and exposes a localized error notification; it does not pretend the remote save succeeded.

Every resolved locale sets both i18next's active language and `<html lang>`, including the
initial render. Locale writes accept only the shared `Locale` union.

## Content boundaries

- UI, admin, accessibility labels, emails, PDFs, and generated Brief prose are system copy
  and use shared translation keys.
- API error payloads remain stable machine codes; clients translate them.
- Training templates are curated system content. Their stable template/skill keys remain
  language-neutral, while localized names/descriptions/levels are authored in the shared
  catalogs. Applying a template persists the language selected for that request, matching
  the text the owner chose.
- Course/trainer records and user journal content are stored authored data. This change does
  not machine-translate names, descriptions, notes, messages, or contact information.

## Stable generated artifacts

Each new Brief stores its generation locale. Summary prose, dates, enum labels, PDF chrome,
shared views, and Brief email chrome use that stored locale so a finalized artifact does not
change when a viewer changes their current UI language. Existing Brief rows migrate to `en`.
Auth verification/reset emails use the validated locale on the initiating auth request.

## Failure, security, and privacy behavior

- Locale headers are untrusted input and are reduced to the two-value allowlist before use.
- Account locale updates require the existing authenticated profile boundary and update only
  the current session user.
- The locale header contains no identity or behavioral data and is not added to telemetry.
- Translation interpolation continues to render through React or escaped fixed email/PDF
  templates; user-authored values never become executable templates.
- Missing translations fall back to English and are visible as missing keys in development.
- Storage denial is a supported browser condition; locale remains in memory for the session.
- Network or account-save failures are distinguishable from success and are test-covered.

## Testing and rollout

Use TDD for shared locale parsing, middleware precedence, account persistence, initial
`<html lang>`, request header propagation, catalog parity, localized training content,
Brief generation/storage, auth and Brief emails, PDF labels, admin/accessibility coverage,
and malformed-input/failure paths. Preserve all existing English assertions. Generate one
additive Drizzle migration and verify schema snapshots. Run shared, API, web, lint,
typecheck, build, and focused coverage checks before review.

Two independent reviewers—GPT-5.6 Luna and GPT-5.6 Terra—review correctness, improvements,
security/privacy, gaps, and coverage. Findings are verified against the repository, fixed
test-first, and both reviewers are rerun until each reports no remaining feedback.

## Final implementation notes

The approved design shipped with these review-driven hardening details:

- Account-scoped rendering waits for a valid session identity and either the account locale
  or an explicit local-fallback outcome. Profile payloads fail closed on malformed identity or
  locale data, and session-scoped caches are cleared when the authenticated user changes.
- Stored Brief dates use UTC calendar semantics across the owned view, public share, email, and
  PDF. Artifact content carries the stored language while the surrounding application may remain
  in the viewer's current UI language.
- Brief generation and lifecycle transitions are serialized at database-backed ownership rows.
  Migration `0023_third_madripoor` repairs legacy duplicate versions and enforces unique
  `(dog_id, version)` values while the legacy API is drained; ambiguous latest-version reads and
  draft shares fail closed during the compatibility window.
- Brief email delivery is intent-first and exact-version bound. New clients provide a Brief ID
  and idempotency UUID; the audit commits before provider I/O and its durable UUID is the provider
  key. The API supports the actual former `{ recipient, message }` payload only when exactly one
  Brief exists, where it can recover a canonical stored intent for that version. Every
  multi-version ID-less request fails without sending because content cannot identify a version.
  Provider I/O holds no database connection, stale claims are retry-reclaimable, and migrations
  `0025`/`0026` distinguish delivered sends while blocking dog/account cascades for every claimed
  send until explicit recovery. Onboarding counts only confirmed delivery.
- The production deploy prevents phase interleaving and preserves the running workflow: drain the
  legacy API, apply the complete immutable migration history through 0026, deploy and verify the
  dual-protocol API, idempotently verify no migration remains, then publish the exact-binding web.
  GitHub Actions retains at most one pending run, replacing an older pending push with a newer one.
  The production image includes both shared workspace packages and is boot-smoked in CI.
- Public Brief bearer paths are normalized to `/b/:token` before telemetry emission and ingest,
  again in admin aggregation, and historically by data-only migration
  `0024_brief_share_telemetry_privacy`, including route-equivalent `%62`/`%42` prefixes.

The implementation was repeatedly reviewed after rebasing onto current `main`. Verified findings
were fixed test-first, including exact Brief-version binding, durable provider idempotency,
provider calls outside transactions, fail-closed deletion recovery, legacy-tab rollout safety,
and secret-rotation-independent retry lookup. Luna and Terra independently returned no actionable
feedback on the same final code state. Final repository, migration, workflow, and production-image
evidence is recorded in PR #70.
