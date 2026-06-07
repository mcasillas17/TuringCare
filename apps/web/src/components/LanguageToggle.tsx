import { useI18n } from "@/i18n";
import type { Locale } from "@/i18n/types";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { type PointerEvent, useEffect, useRef, useState } from "react";

const FLAGS: Record<Locale, string> = { en: "🇺🇸", es: "🇲🇽" };
const LOCALES: readonly Locale[] = ["en", "es"];
const NAME_KEY = { en: "language.nameEn", es: "language.nameEs" } as const;

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set only when a desktop hover (not click/keyboard) opened the popover, so we
  // can skip Radix's auto-focus and avoid stealing focus on a mere mouseover.
  // It never participates in open/close logic — that stays plain `setOpen`.
  const openedByHover = useRef(false);
  const others = LOCALES.filter((l) => l !== locale);

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // Desktop mouse only — touch/pen taps and keyboard go through Radix's own path.
  const isMouse = (e: PointerEvent) => e.pointerType === "mouse";
  const hoverOpen = (e: PointerEvent) => {
    if (!isMouse(e)) return;
    cancelClose();
    openedByHover.current = true;
    setOpen(true);
  };
  const hoverClose = (e: PointerEvent) => {
    if (!isMouse(e)) return;
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={t("language.label")}
          onPointerEnter={hoverOpen}
          onPointerLeave={hoverClose}
          className={cn(
            "group inline-flex items-center gap-1 rounded-full border border-silver/70 bg-surface px-2.5 py-1 text-xs font-semibold text-slate-soft transition-colors hover:border-silver hover:text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper",
            className,
          )}
        >
          <span aria-hidden="true">{FLAGS[locale]}</span>
          <ChevronDownIcon
            aria-hidden="true"
            className="size-3 transition-transform group-data-[state=open]:rotate-180"
          />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={6}
          onOpenAutoFocus={(e) => {
            // A hover-open shouldn't yank focus away from wherever the user was.
            if (openedByHover.current) {
              e.preventDefault();
              openedByHover.current = false;
            }
          }}
          onPointerEnter={cancelClose}
          onPointerLeave={hoverClose}
          className="z-50 min-w-[8rem] rounded-md border border-silver bg-surface p-1 text-xs font-semibold shadow-md"
        >
          {others.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              aria-label={t("language.switchTo", { lang: t(NAME_KEY[l]) })}
              className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-slate-soft transition-colors hover:bg-cream hover:text-slate"
            >
              <span aria-hidden="true">{FLAGS[l]}</span>
              {t(NAME_KEY[l])}
            </button>
          ))}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
