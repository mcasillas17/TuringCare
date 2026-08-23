import { useI18n } from "@/i18n";
import type { Metrics } from "../use-metrics";

export function Funnel({ funnel }: { funnel: Metrics["funnel"] }) {
  const { t } = useI18n();
  const top = funnel[0]?.users || 1;
  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-soft">
        {t("admin.activationFunnel")}
      </h2>
      <div className="space-y-2">
        {funnel.map((f) => (
          <div key={f.step} className="flex items-center gap-3">
            <div className="w-32 text-sm text-slate">{f.step}</div>
            <div className="h-5 flex-1 rounded bg-silver/40">
              <div
                className="h-5 rounded bg-copper"
                style={{ width: `${Math.max(2, (f.users / top) * 100)}%` }}
              />
            </div>
            <div className="w-12 text-right text-sm tabular-nums text-slate">{f.users}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
