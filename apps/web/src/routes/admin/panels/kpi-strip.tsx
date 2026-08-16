import { useI18n } from "@/i18n";
import type { Metrics } from "../use-metrics";

const CARDS = [
  { key: "totalUsers", label: "admin.totalUsers" },
  { key: "newUsers", label: "admin.newUsers" },
  { key: "wau", label: "admin.wau" },
  { key: "activationRate", label: "admin.activationRate", percent: true },
  { key: "returningRate", label: "admin.returningRate", percent: true },
] as const satisfies {
  key: keyof Metrics["kpis"];
  label:
    | "admin.totalUsers"
    | "admin.newUsers"
    | "admin.wau"
    | "admin.activationRate"
    | "admin.returningRate";
  percent?: boolean;
}[];

function format(value: number, percent?: boolean) {
  return percent ? `${Math.round(value * 100)}%` : value.toLocaleString();
}

export function KpiStrip({ kpis }: { kpis: Metrics["kpis"] }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {CARDS.map((c) => (
        <div key={c.key} className="rounded-lg border border-silver bg-white p-4">
          <div className="text-xs uppercase text-slate-soft">{t(c.label)}</div>
          <div className="mt-1 text-2xl font-bold text-slate">
            {" "}
            {format(kpis[c.key], "percent" in c && c.percent)}
          </div>
        </div>
      ))}
    </div>
  );
}
