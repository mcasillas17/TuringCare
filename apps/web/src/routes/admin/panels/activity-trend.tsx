import { useI18n } from "@/i18n";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Metrics } from "../use-metrics";

const COLORS: Record<string, string> = {
  account: "#a98bd0",
  briefs: "#e0a85a",
  discovery: "#9bbf9b",
  dog_care: "#28323d",
  journal: "#6f8ca6",
  navigation: "#c8893b",
  training: "#7fb8d6",
};

export function ActivityTrend({ activityByDay }: { activityByDay: Metrics["activityByDay"] }) {
  const { t } = useI18n();
  const days = new Map<string, Record<string, string | number>>();
  for (const row of activityByDay) {
    const day = days.get(row.day) ?? { day: row.day };
    day[row.category] = row.count;
    days.set(row.day, day);
  }
  const categories = [...new Set(activityByDay.map((row) => row.category))];
  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="text-sm font-semibold uppercase text-slate-soft">{t("admin.activity")}</h2>
      <p className="mb-3 text-xs text-slate-soft">{t("admin.activityHelp")}</p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={[...days.values()]}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} />
          <Tooltip />
          <Legend />
          {categories.map((category) => (
            <Bar
              key={category}
              dataKey={category}
              name={t(`admin.feature_${category}` as Parameters<typeof t>[0])}
              stackId="activity"
              fill={COLORS[category] ?? "#c9d4dd"}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
