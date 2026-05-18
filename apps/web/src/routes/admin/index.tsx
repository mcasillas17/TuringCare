import { useState } from "react";
import { ActiveUsage } from "./panels/active-usage";
import { ActivityFeed } from "./panels/activity-feed";
import { Funnel } from "./panels/funnel";
import { Growth } from "./panels/growth";
import { KpiStrip } from "./panels/kpi-strip";
import { useActivity, useMetrics } from "./use-metrics";

const RANGES = [7, 30, 90] as const;

export function AdminDashboard() {
  const [days, setDays] = useState<number>(30);
  const metrics = useMetrics(days);
  const activity = useActivity();

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">TuringCare · Admin</h1>
        <select
          className="rounded border bg-background px-2 py-1 text-sm"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          {RANGES.map((r) => (
            <option key={r} value={r}>
              Last {r}d
            </option>
          ))}
        </select>
      </header>

      {metrics.isPending ? (
        <p className="p-8">Loading metrics…</p>
      ) : metrics.isError || !metrics.data ? (
        <p className="p-8 text-destructive">Failed to load metrics.</p>
      ) : (
        <>
          <KpiStrip kpis={metrics.data.kpis} />
          <Growth signups={metrics.data.signups} />
          <div className="grid gap-4 md:grid-cols-2">
            <ActiveUsage active={metrics.data.active} kpis={metrics.data.kpis} />
            <Funnel funnel={metrics.data.funnel} />
          </div>
          <ActivityFeed activity={activity.data ?? { items: [] }} />
        </>
      )}
    </div>
  );
}
