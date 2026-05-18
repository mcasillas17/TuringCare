# TuringCare — Nav paw-mark contrast fix

**Date:** 2026-05-17
**Status:** Approved (user explicitly selected the Lucide PawPrint approach via the brainstorming question; design is a faithful minimal realization of that choice). Ready for plan.
**Scope:** one file — `apps/web/src/components/landing/site-nav.tsx` (+ `docs/PROJECT-LOG.md`). No other component, no deps, no backend.

## Problem

`apps/web/src/components/landing/site-nav.tsx` (line ~41) renders the literal
🐾 emoji inside a circular badge styled `grid size-8 place-items-center
rounded-full bg-slate text-cream`. The operating system draws 🐾 as a fixed
**color emoji** (dark brown on macOS), which `text-cream` cannot recolor. The
result is a dark-brown paw on a near-black slate badge — very low contrast,
hard to see (reported on the user's laptop). It is the only paw mark in the
codebase (no footer/favicon duplication; verified by grep).

## Approved change

Replace the 🐾 emoji text node with the **lucide-react `PawPrint`** vector
icon. `lucide-react@^0.468.0` is already a dependency and `import { … } from
"lucide-react"` is the established pattern (e.g.
`apps/web/src/components/landing/how-it-works.tsx`). No new dependency, no
`package.json` change.

In `site-nav.tsx`:

- Add `import { PawPrint } from "lucide-react";` to the existing imports.
- The badge span — keep the wrapper and ALL its classes exactly as-is
  (`grid size-8 place-items-center rounded-full bg-slate text-cream`,
  `aria-hidden`) — change only its child:

```tsx
<span
  aria-hidden
  className="grid size-8 place-items-center rounded-full bg-slate text-cream"
>
  <PawPrint className="size-4" />
</span>
```

Lucide icons stroke with `currentColor`, so the badge's existing `text-cream`
makes the paw render in cream (#faf6ef) on `bg-slate` (#28323d) — a strong,
**device-independent** contrast (no OS emoji rendering). `size-4` (16 px)
inside the 32 px (`size-8`) badge gives balanced padding; the exact icon size
is a controller visual-check tweakable (e.g. `size-4`→`size-5`) — same as how
the hero-photo size was confirmed. `aria-hidden` stays on the wrapper: the mark
is decorative, the adjacent "TuringCare" wordmark conveys the brand name.

No other change: badge box, layout, the "TuringCare" wordmark literal, nav
links, buttons, `LanguageToggle`, scroll behavior, and every other element are
untouched.

## Testing / verification

`apps/web/src/routes/landing.test.tsx` has no assertion on the paw emoji
(it asserts landing sections render); `SiteNav` still renders, so existing
tests stay green. **No new test** — the change is purely visual and is
confirmed by the controller's rendered visual check (same approach used for the
hero-photo enlarge tweak). Gates that must pass:
`pnpm --filter @turingcare/web test` (all green), `typecheck` (0), `pnpm lint`
(0), `pnpm --filter @turingcare/web build`, `pnpm -r exec tsc --noEmit`,
`pnpm -r build`. No `package.json`/`pnpm-lock.yaml`/`apps/api` change.

## Out of scope

Favicon, OG image, footer, i18n, any other component, deps, backend, the badge
size/background/shape (only the emoji→icon swap), and the "TuringCare" wordmark.

## Flagged decisions (reasonable; reviewable)

- Icon size `size-4` is an initial choice; trivially tweakable at the
  controller visual check (`size-5` if it reads too small in the badge).
- `stroke-width` left at lucide's default (2); acceptable for a 16 px mark on a
  dark badge — adjustable later via the `strokeWidth` prop if it looks thin.
