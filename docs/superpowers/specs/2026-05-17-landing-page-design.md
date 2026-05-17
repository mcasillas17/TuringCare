# TuringCare — Landing Page Redesign

**Date:** 2026-05-17
**Status:** Approved design — ready for implementation plan
**Scope:** Replace the bare placeholder landing (`/`) with a modern, warm, animated marketing page. Public route only. No backend changes.

## Context

TuringCare is a deployed, humane/force-free dog-training support platform (React 19 + TypeScript + Tailwind v4 CSS-first + shadcn/ui + React Router v7; Hono/Better Auth API; live at `turingcare.dog`). The current `apps/web/src/routes/landing.tsx` is a placeholder: a heading, one sentence, two buttons on white. Auth (`/login`, `/register`, `/app`) works and is out of scope here.

## Goals

- A credible, warm, modern landing page that explains TuringCare and drives sign-ups.
- Brand palette derived from the owner's dog **Turing**, a blue-merle Mini American Shepherd with gold/copper face & leg points.
- Tasteful, subtle motion (scroll reveals, gentle hovers) that respects `prefers-reduced-motion`.
- No new runtime dependencies; only one new shadcn component (`accordion`).
- Strictly scoped to the public `/` route and new landing components.

## Non-Goals / Out of Scope

- No changes to `/login`, `/register`, `/app`, routing, auth, or any backend/API/schema.
- No new marketing backend (no waitlist/newsletter capture — primary CTA is the existing `/register`).
- No real trainer data (directory is a future feature; the section is a clearly-labeled "coming soon" teaser).
- No image/photo assets; visuals are CSS/SVG so there is nothing to license or host.
- No analytics, no SEO infra beyond a sensible `<title>`/meta description already feasible in `index.html` (optional, not required).

## Brand Palette

Defined as CSS custom properties in `apps/web/src/index.css` inside the existing Tailwind v4 `@theme` layer, **in addition to** (not replacing) shadcn's token set. Landing components use these tokens via Tailwind utilities (e.g. `bg-cream`, `text-slate`, `text-copper`).

| Token | Hex | Role (Turing trait) |
|---|---|---|
| `--color-cream` | `#FAF6EF` | page background (warm off-white) |
| `--color-surface` | `#FFFFFF` | raised cards |
| `--color-surface-sand` | `#F4EEE3` | alt section background |
| `--color-slate` | `#28323D` | merle base — dark sections, headings |
| `--color-slate-soft` | `#4A5C6E` | body text on light |
| `--color-silver` | `#C9D4DD` | merle mottle — borders, dividers, muted |
| `--color-copper` | `#C8893B` | face/leg points — primary accent, CTA fill |
| `--color-gold` | `#E0A85A` | lighter point — gradients, hover |
| `--color-ice` | `#7FB8D6` | merle-eye — subtle glow/ring highlight |

Contrast: copper `#C8893B` on cream and white meets WCAG AA for large text and UI; body copy uses `slate`/`slate-soft` on cream/white (AA). Dark sections use `slate` background with cream text + gold accents.

## Motion System

- `hooks/use-in-view.ts` — IntersectionObserver-based hook returning a ref + `isInView` boolean (fires once, ~12% threshold). If `window.matchMedia('(prefers-reduced-motion: reduce)')` matches, it returns `isInView: true` immediately so **content is never hidden when motion is disabled**.
- `components/landing/reveal.tsx` — wrapper applying an initial "hidden" state (opacity 0, small translate) that transitions to visible when in view, with an optional `delay` prop for stagger. Pure Tailwind/CSS transitions; `tw-animate-css` (already installed via shadcn) available for keyframes (e.g. a slow hero gradient drift).
- All transitions ≤ ~500ms, ease-out, transform/opacity only (no layout thrash). Reduced-motion: no transforms, instant visibility, no infinite animations.

## Sections (each is one focused component)

All live under `apps/web/src/components/landing/`. Copy is marketing copy accurate to the product (no over-promising).

1. **`site-nav.tsx`** — sticky top bar; transparent over hero, gains `cream`/blur background + `silver` bottom border after scroll (small scroll listener or CSS). Left: paw-glyph (inline SVG) + "TuringCare" wordmark. Center/right (desktop): anchor links — How it works, Behavior Brief, Trainers, FAQ. Right: "Log in" (ghost → `/login`), "Get started" (copper → `/register`). Mobile: condensed (links collapse to a simple menu or are hidden, CTAs remain).
2. **`hero.tsx`** — large headline (e.g. "Understand your dog. Train without force."), supporting subcopy about the behavior journal + shareable Behavior Brief, primary CTA "Get started" → `/register`, secondary "Log in" → `/login`, a trust line ("Force-free · science-based · built by dog people"). Visual: a soft animated merle-gradient blob/orb (slate→ice→silver, slow drift) behind a CSS/SVG motif; copper accent shapes. Respects reduced-motion (static gradient).
3. **`how-it-works.tsx`** — section title + 3 steps as icon cards (lucide-react icons, already a dep): (1) Build your dog's profile, (2) Log behavior with the ABC journal (antecedent → behavior → consequence), (3) Generate a Behavior Brief to share with a trainer. Staggered reveal.
4. **`brief-spotlight.tsx`** — two-column feature: left, benefit copy + bullets (structured, science-aligned, shareable PDF, trainer-ready); right, a CSS-rendered mock "Behavior Brief" card (dog name, concerns, ABC entries, severity chips) — no real data, illustrative. Emphasizes the keystone artifact.
5. **`philosophy.tsx`** — full-width `slate` background band, cream text, gold/copper accents. Short manifesto on force-free, science-based methods + 3–4 principle points (e.g. "Behavior is information", "Reinforce, don't intimidate", "Measure, then adjust", "Owners and trainers, aligned").
6. **`trainers-teaser.tsx`** — preview of the planned trainer directory: a few example methodology/certification chips (generic, e.g. "Force-free", "CCPDT", "Fear-Free", "Positive reinforcement"), with a clear **"Coming soon"** badge and copy framing it as upcoming. No fake trainers, no nonfunctional search.
7. **`faq.tsx`** — shadcn `Accordion` (the **only** new shadcn component to add) with ~5 Q&As: Is it really force-free? Do I need a trainer to start? What's a Behavior Brief? Is my data private? What does it cost? (Answers honest/non-committal where the product is early.)
8. **`cta-band.tsx`** — closing full-width copper/gold gradient band, headline + "Get started" → `/register`.
9. **`site-footer.tsx`** — `slate` footer: wordmark, minimal anchor links, a subtle "Built for Turing 🐾", dynamic year.

## Architecture

- `apps/web/src/routes/landing.tsx` becomes a thin composition: renders the nine section components in order inside a page wrapper. Named export `Landing` unchanged (consumed by `main.tsx`); router untouched.
- New: `apps/web/src/components/landing/{site-nav,hero,how-it-works,brief-spotlight,philosophy,trainers-teaser,faq,cta-band,site-footer,reveal}.tsx` and `apps/web/src/hooks/use-in-view.ts`.
- New shadcn component: `accordion` (via `pnpm dlx shadcn@latest add accordion`) → `components/ui/accordion.tsx` (Biome-ignored like other `ui/*`).
- Palette tokens added to `apps/web/src/index.css` `@theme` block; existing shadcn tokens and the `@import "tailwindcss"` / theme setup preserved.
- Icons from `lucide-react` (already a dependency). No new runtime deps.
- Each section component: self-contained, presentational, no props beyond optional layout; independently readable and testable.

## Error Handling

Static marketing content — no data fetching, no error states. The only runtime branch is reduced-motion detection, which fails safe to "fully visible." `use-in-view` guards `window`/`matchMedia` (SSR-safe pattern even though this is CSR) and disconnects the observer on unmount.

## Testing (proportionate)

Vitest + Testing Library (web workspace currently has no tests; this adds the first):
- `Landing` renders and the key section headings/landmarks are present (How it works, Behavior Brief, FAQ, final CTA).
- `useInView` returns `isInView: true` immediately when `prefers-reduced-motion: reduce` is mocked (guarantees content is never hidden without motion).
- FAQ accordion: an item expands on trigger click.
This is primarily a visual deliverable; tests cover the accessibility-critical reduced-motion fallback and that the page composes, not pixel styling.

## Verification

- `pnpm --filter @turingcare/web typecheck`, `pnpm lint`, `pnpm --filter @turingcare/web test`, `pnpm --filter @turingcare/web build` all green.
- Local visual check at `http://localhost:3000/` (dev stack) — all 9 sections render, scroll reveals work, reduced-motion shows everything immediately, mobile width is usable, `/login` and `/register` links navigate correctly.
- No regression to `/login`, `/register`, `/app`.
- Ships via the existing pipeline on push to `main` (no workflow changes).

## Flagged Decisions (reasonable defaults; reviewable)

- Headline/FAQ copy will be written to be honest about the product's early stage; final wording reviewable in the plan/PR.
- "Trainers" and any not-yet-built capability are presented as "coming soon," never as available.
- Palette hexes above are the source of truth; minor tuning for contrast is allowed during implementation without re-approval.
- Primary CTA always routes to the existing `/register`; no new capture mechanism.
