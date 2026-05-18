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
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-1 text-sm font-semibold uppercase text-muted-foreground">Active users</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        DAU {kpis.dau} · WAU {kpis.wau} · MAU {kpis.mau}
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={active}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} />
          <Tooltip />
          <Line type="monotone" dataKey="count" stroke="#b45309" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}
