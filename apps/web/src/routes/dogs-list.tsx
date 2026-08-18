import { DogCard } from "@/components/dogs/dog-card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDogsOverview } from "@/lib/dogs";
import { Link, useNavigate } from "react-router-dom";

export function DogsList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: dogs, isLoading, isError } = useDogsOverview();
  const isEmpty = dogs && dogs.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-slate">{t("dogs.listTitle")}</h1>
      {isLoading && <p>{t("common.loading")}</p>}
      {isError && <p className="text-red-600">{t("dogs.loadError")}</p>}
      {isEmpty && (
        <section className="space-y-3 rounded-2xl border border-silver bg-white p-6 text-center">
          <h2 className="text-lg font-semibold text-slate">{t("dogs.emptyTitle")}</h2>
          <p className="text-slate-soft">{t("dogs.emptyBody")}</p>
          <button
            type="button"
            onClick={() => navigate("/my/dogs/new")}
            className="inline-block rounded bg-slate px-4 py-2 text-cream"
          >
            {t("dogs.emptyCta")}
          </button>
        </section>
      )}
      <div className="space-y-3">
        {dogs?.map((d) => (
          <DogCard key={d.id} dog={d} />
        ))}
      </div>
      {!isEmpty && (
        <Button
          onClick={() => navigate("/my/dogs/new")}
          className="w-full border border-dashed border-silver bg-transparent text-slate-soft"
        >
          {t("dogs.add")}
        </Button>
      )}
      <Link
        to="/my/setup/new"
        className="block text-center text-sm text-slate-soft underline-offset-2 hover:text-slate hover:underline"
      >
        {t("guidedSetup.startAnother")}
      </Link>
    </div>
  );
}
