import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
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
import { CATEGORIES, type Category } from "./event-category";
import { buildSeries } from "./events-series";

type Breakdown = "total" | "byType";
type Granularity = "day" | "week";

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-silver">
      {options.map(([val, label]) => (
        <button
          key={val}
          type="button"
          aria-pressed={value === val}
          onClick={() => onChange(val)}
          className={cn(
            "px-2.5 py-1 text-xs",
            value === val ? "bg-slate text-cream" : "bg-white text-slate-soft",
          )}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

export function EventsOverTime({ eventsByDay }: { eventsByDay: Metrics["eventsByDay"] }) {
  const [breakdown, setBreakdown] = useState<Breakdown>("total");
  const [granularity, setGranularity] = useState<Granularity>("day");
  const [hidden, setHidden] = useState<Set<Category>>(new Set());

  const data = useMemo(
    () => buildSeries(eventsByDay ?? [], granularity, hidden),
    [eventsByDay, granularity, hidden],
  );
  const visible = CATEGORIES.filter((c) => !hidden.has(c.key));

  function toggle(cat: Category) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase text-slate-soft">Events over time</h2>
        <div className="flex items-center gap-2">
          <Segmented
            value={breakdown}
            onChange={setBreakdown}
            options={[
              ["total", "Total"],
              ["byType", "By type"],
            ]}
          />
          <Segmented
            value={granularity}
            onChange={setGranularity}
            options={[
              ["day", "Day"],
              ["week", "Week"],
            ]}
          />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => {
          const on = !hidden.has(c.key);
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(c.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border border-silver px-2.5 py-1 text-xs",
                on ? "bg-white text-slate" : "bg-white text-slate-soft/50",
              )}
            >
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: on ? c.color : "#c9d4dd" }}
              />
              {c.label}
            </button>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={240}>
        {breakdown === "total" ? (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#c8893b"
              fill="#c8893b"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </AreaChart>
        ) : (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" fontSize={11} />
            <YAxis allowDecimals={false} fontSize={11} />
            <Tooltip />
            <Legend />
            {visible.map((c) => (
              <Bar key={c.key} dataKey={c.key} name={c.label} stackId="events" fill={c.color} />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </section>
  );
}
