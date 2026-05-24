import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

const FLAGS = { en: "🇺🇸", es: "🇲🇽" } as const;

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const next = locale === "en" ? "es" : "en";
  const targetName = next === "en" ? t("language.nameEn") : t("language.nameEs");
  const label = t("language.switchTo", { lang: targetName });
  return (
    <button
      type="button"
      onClick={() => setLocale(next)}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-silver/70 bg-surface px-2.5 py-1 text-xs font-semibold text-slate-soft transition-colors hover:border-silver hover:text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper",
        className,
      )}
    >
      <span aria-hidden="true">{FLAGS[locale]}</span>
      {t(`language.${locale}` as "language.en" | "language.es")}
    </button>
  );
}
