import { useState } from "react";
import { ActiveUsage } from "./panels/active-usage";
import { ActivityFeed } from "./panels/activity-feed";
import { FeatureUsage } from "./panels/feature-usage";
import { Funnel } from "./panels/funnel";
import { Growth } from "./panels/growth";
import { KpiStrip } from "./panels/kpi-strip";
import { TopPages } from "./panels/top-pages";
import { useActivity, useMetrics } from "./use-metrics";

const RANGES = [7, 30, 90] as const;

export function AdminDashboard() {
  const [days, setDays] = useState<number>(30);
  const metrics = useMetrics(days);
  const activity = useActivity();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate">Admin dashboard</h1>
        <div>
          <label htmlFor="range-select" className="sr-only">
            Date range
          </label>
          <select
            id="range-select"
            className="rounded border border-silver bg-white px-2 py-1 text-sm text-slate"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {RANGES.map((r) => (
              <option key={r} value={r}>
                Last {r}d
              </option>
            ))}
          </select>
        </div>
      </div>

      {metrics.isPending ? (
        <p className="p-8">Loading metrics…</p>
      ) : metrics.isError || !metrics.data ? (
        <p className="p-8 text-red-600">Failed to load metrics.</p>
      ) : (
        <>
          <KpiStrip kpis={metrics.data.kpis} />
          <Growth signups={metrics.data.signups} />
          <div className="grid gap-4 md:grid-cols-2">
            <ActiveUsage active={metrics.data.active} kpis={metrics.data.kpis} />
            <Funnel funnel={metrics.data.funnel} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FeatureUsage eventVolume={metrics.data.eventVolume} />
            <TopPages topPages={metrics.data.topPages} />
          </div>
          {activity.isError ? (
            <p className="rounded-lg border border-silver bg-white p-4 text-sm text-red-600">
              Activity feed unavailable.
            </p>
          ) : (
            <ActivityFeed activity={activity.data ?? { items: [] }} />
          )}
        </>
      )}
    </div>
  );
}
