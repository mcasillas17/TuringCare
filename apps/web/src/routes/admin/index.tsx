import { useI18n } from "@/i18n";
import { useState } from "react";
import { ActiveUsage } from "./panels/active-usage";
import { ActivityTrend } from "./panels/activity-trend";
import { FeatureAdoption } from "./panels/feature-adoption";
import { Funnel } from "./panels/funnel";
import { Growth } from "./panels/growth";
import { JourneyTimes } from "./panels/journey-times";
import { KpiStrip } from "./panels/kpi-strip";
import { TopPages } from "./panels/top-pages";
import { useMetrics } from "./use-metrics";

const RANGES = [7, 30, 90] as const;

export function AdminDashboard() {
  const { t } = useI18n();
  const [days, setDays] = useState<number>(30);
  const metrics = useMetrics(days);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate">{t("admin.title")}</h1>
          <p className="text-sm text-slate-soft">{t("admin.subtitle")}</p>
        </div>
        <div>
          <label htmlFor="range-select" className="sr-only">
            {t("admin.dateRange")}
          </label>
          <select
            id="range-select"
            className="rounded border border-silver bg-white px-2 py-1 text-sm text-slate"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                {t("admin.lastDays", { days: r })}
              </option>
            ))}
          </select>
        </div>
      </div>

      {metrics.isPending ? (
        <p className="p-8">{t("admin.loading")}</p>
      ) : metrics.isError || !metrics.data ? (
        <p className="p-8 text-red-600">{t("admin.loadError")}</p>
      ) : (
        <>
          <KpiStrip kpis={metrics.data.kpis} />
          <div className="grid gap-4 md:grid-cols-2">
            <ActiveUsage active={metrics.data.active} kpis={metrics.data.kpis} />
            <Growth signups={metrics.data.signups} />
          </div>
          <Funnel funnel={metrics.data.funnel} />
          <JourneyTimes journeyTimes={metrics.data.journeyTimes} />
          <div className="grid gap-4 md:grid-cols-2">
            <FeatureAdoption featureAdoption={metrics.data.featureAdoption} />
            <TopPages topPages={metrics.data.topPages} />
          </div>
          <ActivityTrend activityByDay={metrics.data.activityByDay} />
        </>
      )}
    </div>
  );
}
