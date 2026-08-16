import { useI18n } from "@/i18n";
import type { Metrics } from "../use-metrics";

function duration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 144) / 10}d`;
}

export function JourneyTimes({ journeyTimes }: { journeyTimes: Metrics["journeyTimes"] }) {
  const { t } = useI18n();
  return (
    <section className="rounded-lg border border-silver bg-white p-4">
      <h2 className="text-sm font-semibold uppercase text-slate-soft">
        {t("admin.completionTimes")}
      </h2>
      <p className="mb-3 text-xs text-slate-soft">{t("admin.completionTimesHelp")}</p>
      {journeyTimes.length === 0 ? (
        <p className="text-sm text-slate-soft">{t("admin.noCompletedJourneys")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-soft">
              <tr>
                <th className="py-2">{t("admin.journey")}</th>
                <th className="py-2 text-right">{t("admin.completed")}</th>
                <th className="py-2 text-right">{t("admin.median")}</th>
                <th className="py-2 text-right">{t("admin.p90")}</th>
                <th className="py-2 text-right">{t("admin.within7Days")}</th>
              </tr>
            </thead>
            <tbody>
              {journeyTimes.map((journey) => (
                <tr key={journey.step} className="border-t border-silver/70">
                  <td className="py-2">
                    {t(`admin.journey_${journey.step}` as Parameters<typeof t>[0])}
                  </td>
                  <td className="py-2 text-right tabular-nums">{journey.completed}</td>
                  <td className="py-2 text-right tabular-nums">
                    {duration(journey.medianMinutes)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{duration(journey.p90Minutes)}</td>
                  <td className="py-2 text-right tabular-nums">{journey.within7DaysPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
