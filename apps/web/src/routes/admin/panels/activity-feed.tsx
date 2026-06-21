import type { Activity } from "../use-metrics";

const fmt = new Intl.DateTimeFormat("en-US", {
  dateStyle: "short",
  timeStyle: "short",
  hour12: false,
});

function formatWhen(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : fmt.format(d);
}

export function ActivityFeed({ activity }: { activity: Activity }) {
  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-soft">Live activity</h2>
      <ul className="divide-y divide-silver/60 text-sm">
        {activity.items.map((e) => (
          <li key={e.id} className="flex items-center justify-between py-1.5">
            <span className="font-mono text-xs text-slate-soft">
              {e.userId ? e.userId.slice(0, 8) : "anon"}
            </span>
            <span className="text-slate">{e.name}</span>
            <span className="text-xs text-slate-soft">{formatWhen(e.createdAt)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
