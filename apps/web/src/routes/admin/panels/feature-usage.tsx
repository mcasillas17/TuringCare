import type { Metrics } from "../use-metrics";

export function FeatureUsage({ eventVolume }: { eventVolume: Metrics["eventVolume"] }) {
  const rows = eventVolume.filter((e) => e.name !== "page.viewed");
  const top = rows[0]?.count || 1;
  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-slate-soft">Feature usage</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-soft">No events in range.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((e) => (
            <div key={e.name} className="flex items-center gap-3">
              <div className="w-44 truncate text-sm text-slate" title={e.name}>
                {e.name}
              </div>
              <div className="h-5 flex-1 rounded bg-silver/40">
                <div
                  className="h-5 rounded bg-copper"
                  style={{ width: `${Math.max(2, (e.count / top) * 100)}%` }}
                />
              </div>
              <div className="w-12 text-right text-sm tabular-nums text-slate">{e.count}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
