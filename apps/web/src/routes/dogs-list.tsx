import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDogs } from "@/lib/dogs";
import { Link, useNavigate } from "react-router-dom";

export function DogsList() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data: dogs, isLoading, isError } = useDogs();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold text-slate">{t("dogs.listTitle")}</h1>
      {isLoading && <p>{t("common.loading")}</p>}
      {isError && <p className="text-red-600">{t("dogs.loadError")}</p>}
      {dogs && dogs.length === 0 && <p className="text-slate-soft">{t("dogs.empty")}</p>}
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
      <Button onClick={() => navigate("/my/dogs/new")} className="bg-slate text-cream">
        {t("dogs.add")}
      </Button>
    </div>
  );
}
