import { useI18n } from "@/i18n";
import type { Metrics } from "../use-metrics";

export function FeatureAdoption({
  featureAdoption,
}: {
  featureAdoption: Metrics["featureAdoption"];
}) {
  const { t } = useI18n();
  const top = featureAdoption[0]?.users || 1;
  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="text-sm font-semibold uppercase text-slate-soft">
        {t("admin.featureAdoption")}
      </h2>
      <p className="mb-3 text-xs text-slate-soft">{t("admin.featureAdoptionHelp")}</p>
      {featureAdoption.length === 0 ? (
        <p className="text-sm text-slate-soft">{t("admin.noFeatureUsage")}</p>
      ) : (
        <div className="space-y-2">
          {featureAdoption.map((row) => (
            <div key={row.feature} className="flex items-center gap-3">
              <div className="w-28 text-sm text-slate">
                {t(`admin.feature_${row.feature}` as Parameters<typeof t>[0])}
              </div>
              <div className="h-5 flex-1 rounded bg-silver/40">
                <div
                  className="h-5 rounded bg-copper"
                  style={{ width: `${Math.max(2, (row.users / top) * 100)}%` }}
                />
              </div>
              <div className="w-24 text-right text-sm tabular-nums text-slate">
                {row.users} <span className="text-xs text-slate-soft">/ {row.events}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
