import { useI18n } from "@/i18n";
import type { Metrics } from "../use-metrics";

export function TopPages({ topPages }: { topPages: Metrics["topPages"] }) {
  const { t } = useI18n();
  const top = topPages[0]?.count || 1;
  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-soft">
        {t("admin.topPages")}
      </h2>
      {topPages.length === 0 ? (
        <p className="text-sm text-slate-soft">{t("admin.noPageViewsInRange")}</p>
      ) : (
        <div className="space-y-2">
          {topPages.map((p) => (
            <div key={p.path} className="flex items-center gap-3">
              <div className="w-44 truncate font-mono text-xs text-slate" title={p.path}>
                {p.path}
              </div>
              <div className="h-5 flex-1 rounded bg-silver/40">
                <div
                  className="h-5 rounded bg-copper"
                  style={{ width: `${Math.max(2, (p.count / top) * 100)}%` }}
                />
              </div>
              <div className="w-12 text-right text-sm tabular-nums text-slate">{p.count}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
