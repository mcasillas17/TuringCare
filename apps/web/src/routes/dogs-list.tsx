import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDogs } from "@/lib/dogs";
import { Link, useNavigate } from "react-router-dom";

export function DogsList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: dogs, isLoading, isError } = useDogs();
  const isEmpty = dogs && dogs.length === 0;
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-slate">{t("dogs.listTitle")}</h1>
      {isLoading && <p>{t("common.loading")}</p>}
      {isError && <p className="text-red-600">{t("dogs.loadError")}</p>}
      {isEmpty && (
        <section className="space-y-3 rounded border border-silver bg-white p-6 text-center">
          <h2 className="text-lg font-semibold text-slate">{t("dogs.emptyTitle")}</h2>
          <p className="text-slate-soft">{t("dogs.emptyBody")}</p>
          <Link to="/my/dogs/new" className="inline-block rounded bg-slate px-4 py-2 text-cream">
            {t("dogs.emptyCta")}
          </Link>
        </section>
      )}
      <ul className="space-y-2">
        {dogs?.map((d) => (
          <li key={d.id}>
            <Link
              to={`/my/dogs/${d.id}`}
              className="block rounded border border-silver p-4 hover:bg-surface-sand"
            >
              <span className="font-semibold text-slate">{d.name}</span>
              {d.breed && <span className="text-slate-soft"> · {d.breed}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {!isEmpty && (
        <Button onClick={() => navigate("/my/dogs/new")} className="bg-slate text-cream">
          {t("dogs.add")}
        </Button>
      )}
    </div>
  );
}
