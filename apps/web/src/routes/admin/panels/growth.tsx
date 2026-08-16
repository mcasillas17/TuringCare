import { useI18n } from "@/i18n";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Metrics } from "../use-metrics";

export function Growth({ signups }: { signups: Metrics["signups"] }) {
  const { t } = useI18n();
  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-soft">{t("admin.signups")}</h2>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={signups}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} />
          <Tooltip />
          <Bar dataKey="count" fill="#c8893b" />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
