import type { Metrics } from "../use-metrics";

export function Funnel({ funnel }: { funnel: Metrics["funnel"] }) {
  const top = funnel[0]?.users || 1;
  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-muted-foreground">
        Activation funnel
      </h2>
      <div className="space-y-2">
        {funnel.map((f) => (
          <div key={f.step} className="flex items-center gap-3">
            <div className="w-32 text-sm">{f.step}</div>
            <div className="h-5 flex-1 rounded bg-muted">
              <div
                className="h-5 rounded bg-sky-500"
                style={{ width: `${Math.max(2, (f.users / top) * 100)}%` }}
              />
            </div>
            <div className="w-12 text-right text-sm tabular-nums">{f.users}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
