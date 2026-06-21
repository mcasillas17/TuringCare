import type { Metrics } from "../use-metrics";

const CARDS: { key: keyof Metrics["kpis"]; label: string; format?: (v: number) => string }[] = [
  { key: "totalUsers", label: "Total users" },
  { key: "newUsers", label: "New (range)" },
  { key: "wau", label: "WAU" },
  { key: "stickiness", label: "DAU/MAU", format: (v) => `${Math.round(v * 100)}%` },
  { key: "eventCount", label: "Events (range)" },
];

export function KpiStrip({ kpis }: { kpis: Metrics["kpis"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {CARDS.map((c) => (
        <div key={c.key} className="rounded-lg border border-silver bg-white p-4">
          <div className="text-xs uppercase text-slate-soft">{c.label}</div>
          <div className="mt-1 text-2xl font-bold text-slate">
            {c.format ? c.format(kpis[c.key]) : kpis[c.key]}
          </div>
        </div>
      ))}
    </div>
  );
}
