import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import type { Metrics } from "../use-metrics";

const CARDS: {
  key: keyof Metrics["kpis"];
  labelKey?: MessageKey;
  label?: string;
  format?: (v: number) => string;
}[] = [
  { key: "totalUsers", labelKey: "admin.totalUsers" },
  { key: "newUsers", labelKey: "admin.newRange" },
  { key: "wau", label: "WAU" },
  { key: "stickiness", label: "DAU/MAU", format: (v) => `${Math.round(v * 100)}%` },
  { key: "eventCount", labelKey: "admin.eventsRange" },
];

export function KpiStrip({ kpis }: { kpis: Metrics["kpis"] }) {
  const { t } = useI18n();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {CARDS.map((c) => (
        <div key={c.key} className="rounded-lg border border-silver bg-white p-4">
          <div className="text-xs uppercase text-slate-soft">
            {c.labelKey ? t(c.labelKey) : c.label}
          </div>
          <div className="mt-1 text-2xl font-bold text-slate">
            {c.format ? c.format(kpis[c.key]) : kpis[c.key]}
          </div>
        </div>
      ))}
    </div>
  );
}
