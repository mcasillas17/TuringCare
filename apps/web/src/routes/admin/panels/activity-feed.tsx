import type { Activity } from "../use-metrics";

export function ActivityFeed({ activity }: { activity: Activity }) {
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">Live activity</h2>
      <ul className="divide-y text-sm">
        {activity.items.map((e) => (
          <li key={e.id} className="flex items-center justify-between py-1.5">
            <span className="font-mono text-xs text-muted-foreground">
              {e.userId ? e.userId.slice(0, 8) : "anon"}
            </span>
            <span>{e.name}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(e.createdAt).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
