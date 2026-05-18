import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Metrics } from "../use-metrics";

export function Growth({ signups }: { signups: Metrics["signups"] }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
        Signups over time
      </h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={signups}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} />
          <Tooltip />
          <Bar dataKey="count" fill="#38bdf8" />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
