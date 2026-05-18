import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      className={cn("flex items-center gap-1 text-xs font-semibold", className)}
      // biome-ignore lint/a11y/useSemanticElements: spec requires div+role="group" for styling flexibility
      role="group"
      aria-label={t("language.label")}
    >
      {(["en", "es"] as const).map((l) => (
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
          {t(`language.${l}` as "language.en" | "language.es")}
        </button>
      ))}
    </div>
  );
}
