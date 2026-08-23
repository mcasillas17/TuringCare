# Language Toggle Redesign — Design Spec

**Date:** 2026-05-21
**Status:** Approved (brainstorming)
**Topic:** Make the `LanguageToggle` visually unmistakable (🇺🇸/🇲🇽 country flags) and ensure it sits in a clean top-right slot on every page where it was previously inline.

> **Historical UI design:** Toggle visuals/placement evolved in later May specs. Its
> locale runtime and persistence context was superseded by the 2026-08-23 end-to-end
> design; current behavior is documented in `../../LOCALIZATION.md`.

---

## 1. Goal & scope

Two related complaints, one fix:

1. The plain `EN | ES` text gets visually lost next to login/register links on
   the landing nav and the app-shell header.
2. The toggle isn't visually separated from the CTAs it sits beside on those
   surfaces.

**Placement reality (discovered while planning):** on both the landing nav and
the app-shell header the top-right corner is already occupied by CTA buttons
(Log in / Get started / Open app; Sign out). Absolutely-positioning the toggle
into that corner would overlap them. So instead of a corner slot, on those two
surfaces the toggle stays in the existing top-right actions cluster but is set
apart with the flags **plus a thin vertical divider + spacing** between it and
the CTAs. Auth pages keep their true corner anchor (nothing to collide with).

**In scope:**
- Component update: add 🇺🇸 EN / 🇲🇽 ES (flag + label) inside the existing
  `LanguageToggle` component, preserving its API (no prop changes).
- Landing `site-nav.tsx` + `AppShell.tsx`: keep the toggle in the right-side
  actions cluster; add a vertical divider + spacing between the toggle and the
  CTA buttons so it reads as a separate control.
- Tests: a focused `LanguageToggle.test.tsx`.

**Out of scope:**
- Auth pages (`/login`, `/register`, `/forgot-password`, `/reset-password`):
  already top-right (`absolute right-4 top-4`) — unchanged.
- Settings page: the user is intentionally there to change language; the
  inline placement in the settings list stays.
- Any new locales (still en + es only).
- Icon library or SVG flag dependency (Unicode flag emojis are sufficient).

### Decisions locked during brainstorming

| Decision | Choice |
|---|---|
| Flag representation | Unicode emojis (`🇺🇸` / `🇲🇽`) — no new dependency |
| Button content | `<span aria-hidden>🇺🇸</span> EN` and `<span aria-hidden>🇲🇽</span> ES` |
| Accessible name | Just `EN` / `ES` (flag is decorative; aria-hidden) |
| API change | None — same `<LanguageToggle className?>` signature |
| Mount-site scope | Landing `site-nav.tsx` + `AppShell.tsx` get flags + a divider in the existing right cluster (NOT absolute corner — corner is taken by CTAs); auth/Settings unchanged |
| Flag fallback | Acceptable: on browsers that don't render flag emojis (some Windows), the user sees `🇺🇸 EN` rendered as letter pair + label — still distinguishable |

---

## 2. Component change

**`apps/web/src/components/LanguageToggle.tsx`** (modify, same export):

Inside the existing `{ (["en","es"] as const).map(l => …) }` render, replace
the single text node with a flag span + the existing label:

```tsx
<button
  key={l}
  type="button"
  onClick={() => setLocale(l)}
  aria-pressed={locale === l}
  className={cn(
    "rounded px-1.5 py-0.5 transition-colors",
    locale === l ? "text-copper" : "text-slate-soft hover:text-slate",
  )}
>
  <span aria-hidden="true" className="mr-1">{l === "en" ? "🇺🇸" : "🇲🇽"}</span>
  {t(`language.${l}` as "language.en" | "language.es")}
</button>
```

Public API, styles, `role="group"`, `aria-pressed`, and the existing biome
ignore comment all stay. No new i18n keys: the flag is decorative (the
accessible name still reads "EN" / "ES" from the existing `language.en` /
`language.es` keys).

---

## 3. Per-surface placement

| Surface | Today | Change |
|---|---|---|
| `/login`, `/register`, `/forgot-password`, `/reset-password` | `absolute right-4 top-4` | Unchanged |
| Landing `site-nav.tsx` | First item in the right-side actions cluster (`<div class="flex items-center gap-2">`), flush against the CTAs | Keep in the cluster; insert a vertical divider element (`<span aria-hidden class="h-5 w-px bg-silver/70" />`) BETWEEN `<LanguageToggle/>` and the CTA buttons; bump the cluster gap so the toggle reads as separate. |
| `AppShell.tsx` header | First item in the right-side cluster (`<div class="flex items-center gap-2">`), flush against Sign out | Same divider element between `<LanguageToggle/>` and the Sign-out button. |
| `Settings.tsx` | Inline in the settings list | Unchanged |

No new wrapper components and no absolute positioning on these two surfaces
(the corner is occupied by CTAs). Each affected file gains one divider `<span>`
between the toggle and its neighboring buttons. The divider colour reuses the
existing `silver` palette token already used for nav borders.

---

## 4. Accessibility & i18n

- Emoji wrapped in `<span aria-hidden="true">` so screen readers don't read
  "regional indicator symbol letter U regional indicator symbol letter S".
- Accessible name comes from the existing button text (`EN`/`ES`); the
  outer group keeps `aria-label={t("language.label")}`. `aria-pressed`
  continues to reflect current locale (existing).
- Color contrast unchanged (the emoji is not styled).
- No new i18n keys.

---

## 5. Testing

- **New `apps/web/src/components/LanguageToggle.test.tsx`:**
  - Renders with a `<LocaleProvider>` wrapper; asserts two buttons
    queryable by accessible name `EN` and `ES` (flag must NOT bleed into
    the name → proves `aria-hidden` is doing its job).
  - Initial locale is `en` → the `EN` button has `aria-pressed="true"`, `ES`
    has `aria-pressed="false"`.
  - Clicking `ES` flips `aria-pressed` on both buttons (locale state
    updates).
  - The flag emoji is in the rendered DOM (assert via `container.textContent`
    contains `🇺🇸` and `🇲🇽`), confirming the visual addition.
- **Regression suites stay green** — `landing.test.tsx`, `site-nav.test.tsx`,
  `i18n.test.tsx`, and the auth-page tests all use the toggle indirectly via
  accessible name queries; those queries are unaffected by the flag.
- Visual placement on landing/app-shell isn't pixel-tested (jsdom doesn't
  layout); the change is a Tailwind class swap in two files, low-risk.
- Full monorepo gate (biome + tsc + tests + build) stays green.

---

## 6. Deliverable order

1. Update `LanguageToggle.tsx` + new `LanguageToggle.test.tsx` (TDD).
2. `site-nav.tsx`: add a vertical divider `<span>` between the toggle and the
   CTA buttons in the right-side cluster.
3. `AppShell.tsx`: same divider between the toggle and the Sign-out button.
4. Full gate + PROJECT-LOG entry. The branch is then ready to finish via
   `superpowers:finishing-a-development-branch` (this is the last sub-project
   riding on the current PR).
