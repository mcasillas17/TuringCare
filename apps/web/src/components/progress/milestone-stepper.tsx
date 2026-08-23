import { useI18n } from "@/i18n";
import { LEVEL_KEYS, type ProgressSkill, useSetSkillLevel } from "@/lib/progress";
import { findCatalogSkill, useTrainingCatalog } from "@/lib/training-catalog";
import { formatDateInUtc } from "@turingcare/i18n";

const LEVELS = [1, 2, 3, 4, 5] as const;

export function MilestoneStepper({ dogId, skill }: { dogId: string; skill: ProgressSkill }) {
  const { t, locale } = useI18n();
  const setLevel = useSetSkillLevel(dogId);
  const { data: catalog } = useTrainingCatalog();
  const catalogSkill = findCatalogSkill(catalog, skill.catalogSkillKey);
  const current = skill.confidence;
  const dateFor = (level: number) => {
    const m = skill.milestones.find((x) => x.level === level);
    if (!m) return null;
    const reachedAt = new Date(m.reachedAt);
    if (Number.isNaN(reachedAt.getTime())) return null;
    const includeYear = reachedAt.getUTCFullYear() !== new Date().getUTCFullYear();
    return formatDateInUtc(locale, reachedAt, {
      day: "numeric",
      month: "short",
      year: includeYear ? "numeric" : undefined,
    });
  };
  const descFor = (level: number) => {
    const catalogDesc = catalogSkill?.levels.find((l) => l.level === level)?.description;
    if (catalogDesc) return catalogDesc;
    const key = LEVEL_KEYS[level - 1];
    // LEVEL_KEYS has exactly 5 entries; level is always 1–5 so key is always defined
    return t(key ?? "progress.level1");
  };

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-soft">
        {t("progress.milestonesTitle", { n: current })}
      </p>
      <ol className="space-y-1">
        {LEVELS.map((level) => {
          const reached = level <= current;
          const isCurrent = level === current;
          const isNext = level === current + 1;
          const date = dateFor(level);
          const dot = reached
            ? isCurrent
              ? "bg-copper text-white"
              : "bg-green-600 text-white"
            : "border-2 border-silver text-slate-soft";
          return (
            <li key={level}>
              <button
                type="button"
                disabled={setLevel.isPending}
                aria-label={`${t("training.levelPrefix")} ${level}`}
                onClick={() => setLevel.mutate({ skillId: skill.id, level })}
                className={`w-full rounded-lg p-2 text-left ${isCurrent ? "bg-cream" : "hover:bg-cream"}`}
              >
                <span className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${dot}`}
                    aria-hidden="true"
                  >
                    {reached && !isCurrent ? "✓" : level}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-soft">
                      {t("training.levelPrefix")} {level}
                      {isCurrent ? ` · ${t("progress.currentTag")}` : ""}
                    </span>
                    <span className={`block text-sm ${reached ? "text-slate" : "text-slate-soft"}`}>
                      {descFor(level)}
                    </span>
                    <span className="block text-xs">
                      {level === 1 ? (
                        <span className="text-slate-soft">{t("progress.levelStart")}</span>
                      ) : reached && date ? (
                        <span className="font-medium text-green-700">
                          ✓ {t("progress.reachedOn", { date })}
                        </span>
                      ) : isNext ? (
                        <span className="font-semibold text-copper">
                          {t("progress.markReached")} →
                        </span>
                      ) : reached ? (
                        <span className="font-medium text-green-700">✓</span>
                      ) : (
                        <span className="text-slate-soft">—</span>
                      )}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
