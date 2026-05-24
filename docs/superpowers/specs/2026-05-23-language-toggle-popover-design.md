# Language Toggle → Compact Flag Popover — Design Spec

**Date:** 2026-05-23
**Status:** Approved (brainstorming)
**Topic:** Redesign `LanguageToggle` from a two-button segmented control (both
languages always visible) into a compact, flag-only control that opens a small
popover to switch language, on hover (desktop) or click/tap (all devices).

---

## 1. Goal & scope

Today (after PR #22) `apps/web/src/components/LanguageToggle.tsx` is a **single
pill** showing the **current** flag + code (`🇺🇸 EN`) that **flips on click**,
with a `"Switch to …"` aria-label. It switches silently and never *shows* the
other language, and has no hover behavior. The new design keeps it compact but
makes the choice explicit: a flag-only trigger (`🇺🇸 ▾`) that reveals a small
popover listing the language(s) you are **not** in, opened on hover (desktop) or
click/tap, which you click to switch.

Drop-in replacement: same export `LanguageToggle`, same `{ className }` prop, no
changes to the five call sites (landing `site-nav`, `AppShell`, `login`,
`register`, `settings`).

### Decisions locked during brainstorming
| Decision | Choice |
|---|---|
| Model | Flag-only trigger + popover (not segmented, not "show the other as label") |
| Popover contents | Only the **non-active** language(s) — for two languages, one item |
| Open triggers | click/tap (toggle) + keyboard (Enter/Space) on all devices; **hover on desktop only** |
| Close triggers | select a language, Escape, click/tap outside, pointer-leave (desktop, ~120ms grace) |
| Primitive | Radix `Popover` from the already-installed `radix-ui` package (matches `ui/accordion.tsx`) |
| a11y baseline | click + keyboard always work; hover is a desktop enhancement, never the only path |

**Out of scope (YAGNI):** adding new languages, a search/filter in the popover,
animations beyond Radix defaults, persisting "last opened" state, changing the
i18n system or the `language.*` keys' meaning, restyling the call sites.

---

## 2. Interaction & accessibility

- **Trigger:** a `<button>` showing the current flag glyph + a caret
  (lucide `ChevronDownIcon`, matching the accordion). Accessible name from
  `t("language.label")` plus the current language name (e.g. aria-label
  "Language: English"). The flag glyph is `aria-hidden`. Radix sets
  `aria-expanded`/`aria-haspopup`.
- **Open:** click/tap toggles open; keyboard Enter/Space/Arrow opens (Radix);
  on desktop, `onPointerEnter` opens it. Because the component controls Radix's
  `open` state, all three paths converge on the same state.
- **Hover (desktop only):** `onPointerEnter` on the trigger opens; `onPointerLeave`
  on the trigger/content wrapper closes after a ~120ms timeout (cleared if the
  pointer re-enters the content) so moving from trigger to the option doesn't
  dismiss it. Pointer events from touch are ignored by gating on
  `event.pointerType === "mouse"` (touch taps use the click path). No reliance
  on CSS `:hover`.
- **Close:** selecting a language, Escape, outside click/tap, and (desktop)
  pointer-leave. Radix handles Escape, outside-click, and focus return to the
  trigger.
- **Content:** for each language that is **not** the active one, a `<button>`
  with its flag (`aria-hidden`) + full localized name (`t("language.en"|"es")`).
  Click → `setLocale(l)` then close. Keyboard focus lands on the first option
  when opened via keyboard (Radix default).

---

## 3. Structure

`LanguageToggle.tsx` (rewritten, still one focused file):

```
<Popover open={open} onOpenChange={setOpen}>
  <div onPointerEnter={hoverOpen} onPointerLeave={hoverClose}>  // desktop hover wrapper
    <PopoverTrigger asChild>
      <button aria-label={…}> <span aria-hidden>{currentFlag}</span> <ChevronDownIcon/> </button>
    </PopoverTrigger>
    <PopoverContent>           // small card: border-silver bg-white rounded
      {otherLocales.map((l) => (
        <button onClick={() => { setLocale(l); setOpen(false); }}>
          <span aria-hidden>{flag(l)}</span> {t(`language.${l}`)}
        </button>
      ))}
    </PopoverContent>
  </div>
</Popover>
```

- Imports `{ Popover as PopoverPrimitive } from "radix-ui"` (the project's
  pattern in `ui/accordion.tsx`) and uses the primitive parts
  (`PopoverPrimitive.Root/Trigger/Portal/Content`) **directly inside
  `LanguageToggle.tsx`** — no new `ui/popover.tsx` shared wrapper, since this is
  the only consumer (keep the footprint to one file).
- Flag map: `const FLAG = { en: "🇺🇸", es: "🇲🇽" } as const`. Locales come from the
  i18n `Locale` type so adding a language later only needs the flag + keys.
- `useI18n()` still provides `locale`, `setLocale`, `t`.

---

## 4. Visual

- Compact: flag glyph + caret, existing `text-xs font-semibold` sizing, copper
  accent retained for the trigger. Caret rotates/indicates open if trivial
  (optional; Radix `data-state` allows it without JS).
- Popover content: small rounded card, `border border-silver bg-white`, subtle
  shadow, options styled like the current toggle entries
  (`rounded px-1.5 py-0.5`, hover `text-slate`). Aligned to the trigger
  (Radix `align="end"` so it doesn't overflow the top-right placement).
- Works inside the top-right placements (it's positioned in a portal by Radix,
  so the `absolute right-4 top-4` usages on auth pages still place the trigger
  correctly and the content floats above the layout).

---

## 5. Testing

Rewrite `apps/web/src/components/LanguageToggle.test.tsx` (the current
single-pill click-flip assertions no longer apply):

- **Trigger:** renders with an accessible name; shows the current flag glyph;
  the other language's option is **not** in the document before opening.
- **Click opens + switches:** click the trigger → the non-active language option
  appears (by accessible name, e.g. "Español"); click it → `setLocale` switches
  (assert the trigger's accessible name / flag now reflects the new locale) and
  the option is gone (closed).
- **Keyboard:** focusing the trigger and pressing Enter (or Space) opens it;
  Escape closes it.
- **a11y:** trigger exposes `aria-expanded` toggling open/closed (Radix).
- Hover is a desktop-pointer enhancement; jsdom has no real hover media, so the
  asserted, robust paths are click + keyboard. (Optionally fire a
  `pointerEnter` with `pointerType: "mouse"` to assert it opens, if stable.)

Full web gate stays green (biome, tsc, web tests, build). The five call sites
need no test changes (drop-in).

---

## 6. Deliverable order

1. Rewrite `LanguageToggle.tsx` to the flag-trigger + popover model (Radix
   `Popover` primitives used directly, no new `ui/` file) with click/keyboard +
   desktop-hover open and the a11y behavior above.
2. Rewrite `LanguageToggle.test.tsx` for the new behavior (TDD: write the new
   tests, watch them fail against the old component, implement, green).
3. Full web gate + PROJECT-LOG entry; ship as a PR off `main`.
