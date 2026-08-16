import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Metrics } from "../use-metrics";

export function ActiveUsage({
  active,
  kpis,
}: { active: Metrics["active"]; kpis: Metrics["kpis"] }) {
  const { t } = useI18n();
  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold uppercase text-slate-soft">
        {t("admin.activeUsers")}
      </h2>
      <p className="mb-3 text-xs text-slate-soft">
        DAU {kpis.dau} · WAU {kpis.wau} · MAU {kpis.mau}
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={active}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} />
          <Tooltip />
          <Line type="monotone" dataKey="count" stroke="#c8893b" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
import { useI18n } from "@/i18n";
