import { useI18n } from "@/i18n";
import type { Metrics } from "../use-metrics";

export function Funnel({ funnel }: { funnel: Metrics["funnel"] }) {
  const { t } = useI18n();
  const top = funnel[0]?.users || 1;
  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="text-sm font-semibold uppercase text-slate-soft">{t("admin.funnel")}</h2>
      <p className="mb-3 text-xs text-slate-soft">{t("admin.funnelHelp")}</p>
      <div className="space-y-2">
        {funnel.map((f, index) => (
          <div key={f.step} className="flex items-center gap-3">
            <div className="w-36 text-sm text-slate">
              {t(`admin.step_${f.step}` as Parameters<typeof t>[0])}
            </div>
            <div className="h-5 flex-1 rounded bg-silver/40">
              <div
                className="h-5 rounded bg-copper"
                style={{ width: `${Math.max(2, (f.users / top) * 100)}%` }}
              />
            </div>
            <div className="w-28 text-right text-sm tabular-nums text-slate">
              {f.users}
              <span className="ml-2 text-xs text-slate-soft">
                {index === 0
                  ? "100%"
                  : `${Math.round((f.users / (funnel[index - 1]?.users || 1)) * 100)}%`}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
