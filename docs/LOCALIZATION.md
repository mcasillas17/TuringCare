# Localization

TuringCare supports exactly English (`en`) and Spanish (`es`). Locale values are untrusted
until reduced to that allowlist; English is the final fallback throughout the web, API,
database, email, and PDF paths.

## Runtime and catalogs

`packages/i18n` owns the typed English and Spanish catalogs and the framework-neutral
i18next factories/helpers. Catalog parity is enforced by TypeScript and tests. The web
adapter in `apps/web/src/i18n` preserves the existing `LocaleProvider`, `useI18n()`, and
typed `t("section.key")` interface while using `react-i18next` for reactive rendering. The
API imports the same catalogs through i18next core.

Do not add a second catalog under an app. Add fixed system copy to both
`packages/i18n/src/en.ts` and `packages/i18n/src/es.ts`, then use its typed message key.
Keep stable API error codes language-neutral and translate them at the UI boundary.

Catalog tests enforce both exact key parity and interpolation-placeholder parity across
every English and Spanish leaf message. A translation must preserve the same `{variable}`
names as its English source; reordered placeholders are supported, missing or renamed ones
fail the i18n package tests.

## Web copy and date guardrails

`apps/web/src/i18n/ui-copy-audit.test.ts` parses production TypeScript with the TypeScript
AST. It scans all non-test `.ts` and `.tsx` files below `apps/web/src` and fails when fixed
interface copy bypasses the catalog in JSX text, common accessibility attributes (including
Sonner's `containerAriaLabel` and the shared Sheet's `closeLabel`), Sonner toast titles,
descriptions, and promise states, or reviewed display-object properties and props. Sonner
imports are recognized through named, local, and namespace aliases. Toast option objects are
resolved through local aliases and spreads, including shorthand values, getters, callback
methods, or function declarations. Imported shorthand values, and imported or dynamic option
sources, property calls, or direct toast messages that cannot be resolved within the file,
fail closed; catalog calls are trusted only when their `t` binding comes from the app's
`useI18n` hook imported from the exact app module, and local option-helper returns are
inspected. Local constants, nested object and array destructured constants, getter values,
destructuring defaults, parameter defaults, and non-exported helper or object-member returns
are followed into those sinks. For destructuring from imported, dynamic, or reviewed authored
producers, the audit checks both unresolved source/member provenance and any literal fallback,
because either value can render. An unresolved spread is evaluated according to whether it can
override a known property. Every getter return path is inspected through both destructuring
and direct or chained member access. React `useState` tuple values remain authored runtime
state, but literal and lazy-literal initializers are still audited as fixed copy. A narrow
module-and-export allowlist covers existing hooks and catalog lookups whose results are
reviewed authored or localized data. The exact export identity is preserved through named
import aliases, namespace members, and members of local object literals passed directly to the
unshadowed global `Object.freeze`. Mutable object-member aliases fail closed. Trust begins only
after that producer is called; the imported function object and its static properties remain
untrusted UI-copy sources. Same-named imports from any other module and other imported/dynamic
factories fail closed. Allowlisted producer output is treated as authored or localized, but a
literal destructuring default is still fixed UI copy and must use the catalog. Imported
JSX spreads and their nested local aliases are rejected so a separate copy module cannot
bypass the catalog. Exported helper returns are also checked for fixed copy, with a narrow,
reviewed allowlist for stable serializers, query keys, and typed message-key helpers.
The audit rejects direct `toLocale*` calls and `Intl.DateTimeFormat` construction throughout
production source. Authored values, catalog calls, stable machine data, brand identities,
and narrowly reviewed decorative glyphs remain outside the fixed-copy rule.

Use `formatDate(locale, value, options)` from `@turingcare/i18n` for local-time display and
`formatDateInUtc(locale, value, options)` for locale-stable artifact/calendar dates. Both
require an allowlisted locale and return `null` for absent or malformed dates instead of
throwing. UI callers must choose an appropriate localized fallback such as
`common.unavailable`; do not call ambient `toLocale*` methods or construct a formatter
inside a component.

## Web preference resolution

The effective preference order is:

1. Authenticated `user.locale`, when it is non-null and valid.
2. A valid `tc-locale` value in local storage.
3. The first supported value in `navigator.languages`, falling back to
   `navigator.language`.
4. English.

The first render resolves steps 2–4, updates i18next and `<html lang>`, and keeps the active
locale in memory even when browser storage is denied. After a valid authenticated session
is established, the account bridge loads the profile before account-scoped content renders:

- A stored account locale is adopted without being treated as a new user selection.
- A null account locale is initialized once from the already-resolved local/browser locale.
- An explicit switch updates memory and local storage immediately, then persists the account
  preference through the authenticated profile route.
- A profile read, malformed response, or save failure falls back to the local selection and
  shows localized failure feedback; it is never reported as a successful account save.

Session identity and locale-sensitive query caches are scoped by a validated, non-empty user
ID so one account's profile, trainer detail, or localized training catalog cannot bleed into
another session.

## HTTP locale contract

The web Hono client and Better Auth client use the same locale-aware fetch wrapper. It adds
the current active locale without replacing caller-supplied headers:

```http
X-TuringCare-Locale: es
```

The Hono middleware resolves requests in this order:

1. An exact allowlisted `X-TuringCare-Locale` (`en` or `es`).
2. The highest-quality supported value in bounded, syntactically valid
   `Accept-Language` input.
3. English.

Invalid, unsupported, duplicate-quality, disabled (`q=0`), or oversized inputs do not enter
request context, persistence, templates, or document attributes. The API emits the resolved
locale as `Content-Language`; CORS allows `X-TuringCare-Locale`. Do not add locale to event
properties or application logs.

## Content and artifact boundaries

Translate system-authored content:

- Web and admin UI copy, accessibility names, status/enum labels, validation feedback, and
  date/unit chrome.
- Curated training template, skill, level, and milestone display text. Stable template and
  skill keys remain language-neutral. Applying a template persists the localized display text
  returned for that request.
- Verification and password-reset email chrome, using the validated initiating request
  locale.
- Behavior Brief prose and all Brief UI, public-share, email, and PDF chrome.

Do not machine-translate authored records: dog/profile names, journal entries, goals created
by a user, personal email messages, trainer/course database records, descriptions, contact
details, or other submitted content. Interpolated authored values remain data and are escaped
by React or the fixed email/PDF renderers; they are never executable translation templates.

## Locale-stable Behavior Briefs

Migration `0022_panoramic_skullbuster` adds nullable `user.locale` and non-null
`briefs.locale` with an English default for legacy rows. Every newly generated Brief stores
the validated request locale alongside its composed summary. The stored locale—not the
current UI or viewer locale—controls:

- Summary prose and check-in/training enum labels.
- Generated date and status/version chrome in the owned view; the public view uses the
  stored locale for its title, version, summary, and PDF handoff.
- The public-share artifact content's `lang` annotations.
- Brief email subject, HTML/text chrome, and root `lang` attribute.
- PDF labels, dates, and localized filename.

Artifact dates are formatted in UTC so the visible generated calendar day does not vary by
viewer timezone. A malformed or absent legacy locale fails closed to English.

Brief lifecycle routes also fail closed when the latest version is ambiguous during the
phased migration window. Per-dog generation and share/finalize/send transitions are
serialized at database-backed ownership rows, `(dog_id, version)` is unique after migration
`0023_third_madripoor`, draft Briefs cannot be shared, and stable machine error codes drive
localized recovery feedback.

## Durable Brief email delivery

The current shared client contract requires both an exact `briefId` and a UUID
`idempotencyKey`. The send audit is written before provider I/O, the provider receives the
durable send UUID as its idempotency key, and no database transaction or ownership lock is
held across the network call. A delivered timestamp distinguishes successful delivery from
an intent that still needs recovery; onboarding counts only delivered sends.

The API temporarily supports the actual former web payload, `{ recipient, message }`, so the
API can deploy before a new web bundle without making already-open tabs unsafe. This decoder
is intentionally narrower than the shared schema:

- With one Brief version, the request binds to that exact row.
- With multiple versions, an unbound legacy request returns `client_upgrade_required` and
  sends nothing.
- With exactly one Brief version, a retry first matches the canonical stored
  owner/Brief/recipient/message intent, so a pre-rollout random audit UUID or server-secret
  rotation cannot cause redelivery.
- With multiple Brief versions, every ID-less legacy request fails without sending even if its
  recipient/message uniquely match an older audit. Those fields cannot prove whether the tab
  means to replay the old version or send the new version; only an exact-ID client can resolve it.
- An active delivery claim returns `send_in_progress`. A claim with a missing timestamp or
  older than 30 seconds can be reclaimed only by retrying that same durable intent; the
  provider still receives the original send UUID.

Migration `0025_petite_guardian` adds and backfills `delivered_at`. Migration
`0026_first_nitro` adds the delivery claim and a database trigger that rejects deletion of
any claimed send, including stale or timestamp-less claims. The 30-second threshold permits
retry takeover; it never makes deletion safe. Dog deletion and account-deletion preflight
therefore distinguish an active delivery from recovery-required state and link the owner to
the affected Brief. This fail-closed database guard also protects raw cascade deletes and a
request-time recheck covers account-deletion races.

## Privacy and telemetry

A locale is a two-value display preference, is not used as an identity signal, and is not
recorded in first-party telemetry. Public Brief share URLs contain bearer tokens, so page
paths are normalized to `/b/:token` before browser emission, again during API validation,
and in admin aggregation. Migration `0024_brief_share_telemetry_privacy` cleans historical
literal and route-equivalent once-encoded share paths. Public share responses expose a strict
Brief whitelist and never return a user ID, dog ID, or token.

Production configuration requires `RESEND_API_KEY`, so localized Brief/auth emails cannot be
acknowledged in provider-free log mode. Non-production no-key mode logs only a fixed redacted
diagnostic; recipient addresses and subjects are not written to that fallback log.

## Adding or changing localized copy

1. Decide whether the value is fixed system copy. Leave authored database fields unchanged.
2. Add the same key shape to `packages/i18n/src/en.ts` and `packages/i18n/src/es.ts`.
3. Render with the shared typed translator. Server artifacts must receive a validated or
   stored `Locale`; do not read browser state in email/PDF/Brief composition.
4. For curated training data, preserve stable keys and localize only display fields.
5. Add English and Spanish behavior tests, including fallback and malformed-input branches.
6. Run the catalog and web AST audits, then the full Node 22 gates from `README.md`.

Useful focused checks:

```bash
pnpm --filter @turingcare/i18n test
pnpm --filter @turingcare/shared test
pnpm --filter @turingcare/api exec vitest run src/middleware/locale.test.ts
pnpm --filter @turingcare/web exec vitest run src/i18n src/lib/api.test.ts src/lib/when.test.ts
```

API tests require the migrated local Postgres database. Use Vitest's
`--coverage --coverage.reporter=text` flags when inspecting branch coverage; keep generated
coverage output outside the repository or remove it before committing.
