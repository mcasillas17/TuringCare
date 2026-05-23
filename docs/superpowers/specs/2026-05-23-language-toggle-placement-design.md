# TuringCare — Universal language chip in the top-right corner

**Date:** 2026-05-23
**Status:** Approved design. User approved the mobile form (current-language flag
chip), the desktop form (same chip everywhere — unified, not responsive), the
corner ordering (chip is the literal rightmost element), and the integrated
per-header implementation approach during brainstorming. Ready for written spec
review before implementation planning.
**Scope:** Frontend only, `apps/web`. Refactor the existing `LanguageToggle`
component from a two-button toggle into a single compact "flag chip" and make it
appear, consistently, as the **last (rightmost) element of the top-right corner
on every screen** — including the two admin screens that lack it today. No API,
no DB, no new dependencies, no persistence changes.

## Goal

The language control should sit all the way in the top-right corner of **every**
screen in the platform, look identical everywhere, and be visually subtle
(especially on mobile). Today the control already lives top-right on three of the
four layouts but as a wider two-button toggle (`🇺🇸 EN  🇲🇽 ES`), and it is
**missing entirely on the admin screens**. This sub-project unifies the control
into one compact chip and closes the coverage gap.

## Current upstream context

`LanguageToggle` (`apps/web/src/components/LanguageToggle.tsx`) renders a
`div role="group"` containing two `<button>`s (en, es), each showing flag + short
code, the active one in copper. It reads `locale`, `setLocale`, `t` from the
custom i18n context (`apps/web/src/i18n/index.tsx`).

i18n facts (verified):
- `language.en` = `"EN"`, `language.es` = `"ES"`, `language.label` =
  `"Language"`/`"Idioma"` in both `en.ts` and `es.ts`.
- Flags map `en → 🇺🇸`, `es → 🇲🇽`.
- `t(key, vars)` supports `{var}` interpolation
  (`translate()` in `i18n/index.tsx`: `raw.replace(/\{(\w+)\}/g, …)`).
- Exactly two locales exist: `"en"` and `"es"`.

Every screen routes through one of four layouts (`apps/web/src/main.tsx`):

| Layout | File | Screens | Toggle today |
| --- | --- | --- | --- |
| SiteNav | `components/landing/site-nav.tsx` | `/` | yes — `<LanguageToggle/>` · divider · CTAs |
| Auth pages | `routes/login.tsx`, `register.tsx`, `forgot-password.tsx`, `reset-password.tsx` | `/login`, `/register`, `/forgot-password`, `/reset-password` | yes — `absolute right-4 top-4`, no neighbors |
| AppShell | `components/app-shell/AppShell.tsx` | all `/my/*` | yes — `<LanguageToggle/>` · divider · Sign out |
| Admin | `routes/admin/index.tsx`, `routes/admin/trainers.tsx` | `/admin`, `/admin/trainers` | **no** |

Note: admin page content is hardcoded English (not run through `t()`); see
Non-goals.

## Design

### 1. Component refactor — `LanguageToggle.tsx` becomes a single flag chip

Replace the two-button group with one `<button type="button">` styled as a
compact rounded-full pill that shows the **current** language only (flag + short
code, e.g. `🇺🇸 EN`). Clicking it switches to the other locale:

```ts
const next = locale === "en" ? "es" : "en";
```

- Keep the component **named** `LanguageToggle` (avoids churning its import sites)
  and keep its `className` passthrough prop (auth pages rely on it for
  `absolute right-4 top-4`).
- Visible content: flag (`aria-hidden`) + current code from
  `t(\`language.${locale}\`)`.
- On-brand styling: `inline-flex items-center gap-1.5 rounded-full border
  border-silver/70 bg-surface px-2.5 py-1 text-xs font-semibold text-slate-soft
  transition-colors hover:text-slate hover:border-silver focus-visible:outline-none
  focus-visible:ring-2 focus-visible:ring-copper` (final classes tuned during
  implementation; cursor pointer). The `biome-ignore` for `role="group"` is
  removed along with the group.

### 2. Placement — chip is the literal rightmost element on every surface

The chip is the **last** item in each top-right cluster, after any action
buttons, with the existing vertical divider sitting between the buttons and the
chip.

- **AppShell** (`AppShell.tsx`): reorder the right cluster from
  `chip · divider · Sign out` to `Sign out · divider · chip`.
- **SiteNav** (`site-nav.tsx`): reorder from `chip · divider · CTAs` to
  `CTAs · divider · chip`, where CTAs = `Log in` + `Get started` (logged out) or
  `Open app` (logged in).
- **Auth pages** (login/register/forgot/reset): no placement change — the chip is
  already `absolute right-4 top-4` with no neighbors; it simply inherits the new
  chip rendering. (4 files, no edits beyond the component refactor flowing
  through.)
- **Admin** (`admin/index.tsx`, `admin/trainers.tsx`): **add** `<LanguageToggle/>`
  as the last item of each existing `<header className="flex items-center
  justify-between">` right cluster, after the range selector / "Manage trainers"
  link, preceded by the same divider element used elsewhere. Both admin headers
  follow the same `<h1>TuringCare · …</h1>` + right-cluster shape, so the chip is
  added identically to each.

### 3. Interaction & accessibility

- One `type="button"`; tap switches locale (two-locale cycle).
- Accessible name describes the **action and target**, not just the current
  state: `aria-label = t("language.switchTo", { lang })` →
  "Switch to Español" / "Cambiar a English", where `lang` is the **endonym** of
  the *other* locale. Same string mirrored into `title` for a hover tooltip.
- Visible code (`EN`/`ES`) conveys current state to sighted users; the flag is
  `aria-hidden`.
- Copper `focus-visible` ring for keyboard users.
- `document.documentElement.lang` continues to be set by the existing
  `LocaleProvider` — unchanged.

### 4. i18n changes (`en.ts` + `es.ts`, parity required)

- **Keep** `language.en` / `language.es` (now used as the visible chip code).
- **Add** `language.switchTo` = `"Switch to {lang}"` (en) / `"Cambiar a {lang}"`
  (es).
- **Add** endonym keys `language.nameEn` = `"English"` and `language.nameEs` =
  `"Español"` (identical values in both files); the component selects the
  *other* locale's endonym for the `{lang}` var.
- **Remove** `language.label` (was the `role="group"` label, now unused) and its
  `MessageKey` type entry. Verified its only reference is `LanguageToggle.tsx`
  itself, which this refactor rewrites — safe to delete.

### 5. Testing

Exactly **two** existing test files exercise the toggle (verified by grep for
`EN`/`ES` button names, flag glyphs, and `aria-pressed`); both must be updated.

- **Rewrite** `components/LanguageToggle.test.tsx` (currently 3 tests asserting
  the two-button group: both `EN` and `ES` buttons present, both flag glyphs in
  the DOM, and `aria-pressed` toggling). New assertions for the single chip:
  - renders only the **current** language's flag + code (e.g. `🇺🇸 EN`; the
    other flag `🇲🇽` is *not* in the DOM while locale is `en`);
  - clicking the chip switches the locale and re-renders to the other code
    (via a real `LocaleProvider` wrapper);
  - `aria-label` names the **target** language (e.g. "Switch to Español");
  - `className` is passed through to the button.
- **Update** `routes/landing.test.tsx` — the "switches the landing copy to
  Spanish via the toggle" test currently does
  `getAllByRole("button", { name: "ES" })[0]`. With the chip there is no `ES`
  button while in English; change it to find the chip (by its `aria-label`
  "Switch to Español", or the single button) and click it to switch.
- `AppShell.test.tsx` and `landing/site-nav.test.tsx` exist but assert no
  toggle internals — no change expected (re-run to confirm).
- Biome lint and `tsc` pass; full `apps/web` test suite green.

### 6. Non-goals

- Translating admin page content (stays English; the chip is added for
  consistency and starts doing real work once admin is translated later — a
  separate effort).
- Supporting more than two languages. The tap-to-cycle interaction assumes
  exactly two locales; if a third is ever added, the chip should become a small
  menu/popover instead. Called out so the next person knows the boundary.
- Any global floating/overlay control rendered at the app root (considered and
  rejected: it would float over the header and collide with the existing
  top-right buttons, and breaks the integrated in-bar look that was approved).
- localStorage / locale-detection / persistence changes (already handled by
  `LocaleProvider`).

## Files touched (anticipated)

- `apps/web/src/components/LanguageToggle.tsx` — refactor to chip.
- `apps/web/src/components/app-shell/AppShell.tsx` — reorder right cluster.
- `apps/web/src/components/landing/site-nav.tsx` — reorder right cluster.
- `apps/web/src/routes/admin/index.tsx` — add chip to header.
- `apps/web/src/routes/admin/trainers.tsx` — add chip to header.
- `apps/web/src/i18n/en.ts`, `apps/web/src/i18n/es.ts`, `apps/web/src/i18n/types.ts`
  — i18n key add/remove + type update.
- `apps/web/src/components/LanguageToggle.test.tsx` — rewrite for single chip.
- `apps/web/src/routes/landing.test.tsx` — update the Spanish-switch test to
  click the chip.
- Auth pages (`login/register/forgot-password/reset-password`) — no edits
  expected; inherit the refactor.
