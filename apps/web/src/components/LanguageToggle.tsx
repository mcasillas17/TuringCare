import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/** Two locales: one button that switches to the other one. */
export function LanguageToggle({ className }: { className?: string }) {
  const { locale, selectLocale, t } = useI18n();
  const other = locale === "en" ? "es" : "en";
  const name = t(other === "es" ? "language.nameEs" : "language.nameEn");

  return (
    <button
      type="button"
      onClick={() => selectLocale(other)}
      aria-label={t("language.switchTo", { lang: name })}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-silver/70 bg-surface px-2.5 py-1 text-xs font-semibold text-slate-soft transition-colors hover:border-silver hover:text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper",
        className,
      )}
    >
      <span aria-hidden="true">{other === "es" ? "🇲🇽" : "🇺🇸"}</span>
      {name}
    </button>
  );
}
