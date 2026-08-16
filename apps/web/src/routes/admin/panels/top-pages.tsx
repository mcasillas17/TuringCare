import { useI18n } from "@/i18n";
import type { Metrics } from "../use-metrics";

export function TopPages({ topPages }: { topPages: Metrics["topPages"] }) {
  const { t } = useI18n();
  const top = topPages[0]?.views || 1;
  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="text-sm font-semibold uppercase text-slate-soft">{t("admin.topPages")}</h2>
      <p className="mb-3 text-xs text-slate-soft">{t("admin.topPagesHelp")}</p>
      {topPages.length === 0 ? (
        <p className="text-sm text-slate-soft">{t("admin.noPageViews")}</p>
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
                  style={{ width: `${Math.max(2, (p.views / top) * 100)}%` }}
                />
              </div>
              <div className="w-24 text-right text-sm tabular-nums text-slate">
                {p.views} <span className="text-xs text-slate-soft">/ {p.users}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
