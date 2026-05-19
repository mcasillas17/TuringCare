import { useI18n } from "@/i18n";
import { useDogs } from "@/lib/dogs";
import { useOverview } from "@/lib/overview";
import { Link } from "react-router-dom";

export function Overview() {
  const { t } = useI18n();
  const { data: o, isLoading, isError } = useOverview();
  const { data: dogs } = useDogs();

  if (isLoading) return <p>{t("common.loading")}</p>;
  if (isError || !o) return <p className="text-red-600">{t("dogs.loadError")}</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate">{t("overview.greeting")} 👋</h1>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded border border-silver bg-white p-4">
          <div className="text-slate-soft text-sm">{t("overview.statDogs")}</div>
          <div className="text-2xl font-bold text-slate">{o.dogCount}</div>
        </div>
        <div className="rounded border border-silver bg-white p-4">
          <div className="text-slate-soft text-sm">{t("overview.statEntries")}</div>
          <div className="text-2xl font-bold text-slate">{o.journalEntryCount}</div>
        </div>
        <div className="rounded border border-silver bg-white p-4">
          <div className="text-slate-soft text-sm">{t("overview.statBrief")}</div>
          <div className="text-lg font-bold text-copper">
            {o.latestBrief ? o.latestBrief.status : t("overview.noBrief")}
          </div>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-4">
          <section>
            <h2 className="mb-2 font-semibold text-slate">{t("overview.yourDogs")}</h2>
            <div className="flex flex-wrap gap-3">
              {dogs?.map((d) => (
                <Link
                  key={d.id}
                  to={`/app/dogs/${d.id}`}
                  className="rounded border border-silver bg-white p-3 hover:bg-surface-sand"
                >
                  🐕 <span className="font-semibold text-slate">{d.name}</span>
                </Link>
              ))}
              <Link
                to="/app/dogs/new"
                className="rounded border border-dashed border-copper p-3 text-copper"
              >
                + {t("overview.qAddDog")}
              </Link>
            </div>
          </section>
          <section>
            <h2 className="mb-2 font-semibold text-slate">{t("overview.recent")}</h2>
            {o.recentActivity.length === 0 ? (
              <p className="text-slate-soft">{t("overview.noActivity")}</p>
            ) : (
              <ul className="rounded border border-silver bg-white p-3 text-sm">
                {o.recentActivity.map((a, idx) => (
                  <li key={`${a.dogName}-${a.occurredAt}-${idx}`}>
                    <span className="font-medium text-slate">{a.dogName}</span>: {a.behavior}{" "}
                    <span className="text-slate-soft">· {a.occurredAt.slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold text-slate">{t("overview.quick")}</h2>
          <Link to="/app/journal" className="block rounded bg-slate p-2 text-center text-cream">
            {t("overview.qLog")}
          </Link>
          <Link
            to="/app/dogs/new"
            className="block rounded border border-silver bg-white p-2 text-center"
          >
            {t("overview.qAddDog")}
          </Link>
          <Link
            to="/app/brief"
            className="block rounded border border-silver bg-white p-2 text-center"
          >
            {t("overview.qBrief")}
          </Link>
          <Link
            to="/app/trainers"
            className="block rounded border border-silver bg-white p-2 text-center"
          >
            {t("overview.qTrainer")}
          </Link>
        </div>
      </div>
    </div>
  );
}
