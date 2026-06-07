import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDeleteDog, useDog } from "@/lib/dogs";
import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

export function DogLayout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const { data, isLoading, isError } = useDog(id);
  const del = useDeleteDog();
  const [confirming, setConfirming] = useState(false);

  if (isLoading) return null;
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <p className="text-red-600">{t("dogHub.notFound")}</p>
        <Button asChild variant="outline">
          <Link to="/my">{t("dogHub.backToDashboard")}</Link>
        </Button>
      </div>
    );
  }

  const dog = data.dog;
  const sizeLabel: Record<string, string> = {
    small: t("dogs.sizeSmall"),
    medium: t("dogs.sizeMedium"),
    large: t("dogs.sizeLarge"),
    giant: t("dogs.sizeGiant"),
  };
  const sexLabel: Record<string, string> = {
    male: t("dogs.sexMale"),
    female: t("dogs.sexFemale"),
  };
  const subtitle = [dog.breed, sizeLabel[dog.size], sexLabel[dog.sex]].filter(Boolean).join(" · ");

  const tabs = [
    { to: `/my/dogs/${dog.id}`, label: t("dogHub.tabOverview"), end: true },
    { to: `/my/dogs/${dog.id}/journal`, label: t("dogHub.tabJournal"), end: false },
    { to: `/my/dogs/${dog.id}/training`, label: t("dogHub.tabTraining"), end: false },
    { to: `/my/dogs/${dog.id}/brief`, label: t("dogHub.tabBrief"), end: false },
    { to: `/my/dogs/${dog.id}/week`, label: t("dogHub.tabWeek"), end: false },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="sticky top-0 z-10 -mx-4 space-y-3 border-b border-silver bg-cream/95 px-4 pt-3 pb-2 backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <Link to="/my" className="text-xs text-slate-soft hover:underline">
            ← {t("dogHub.backToDashboard")}
          </Link>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold text-slate">{dog.name}</h1>
            {subtitle && <p className="text-sm text-slate-soft">{subtitle}</p>}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to={`/my/dogs/${dog.id}/edit`}>{t("dogs.edit")}</Link>
            </Button>
            {confirming ? (
              <>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await del.mutateAsync(dog.id);
                      toast.success(t("dogs.deleted"));
                      navigate("/my");
                    } catch {
                      toast.error(t("dogs.saveFailed"));
                    }
                  }}
                  className="border-red-600 text-red-600"
                >
                  {t("dogs.deleteYes")}
                </Button>
                <Button variant="outline" onClick={() => setConfirming(false)}>
                  {t("dogs.deleteCancel")}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setConfirming(true)}>
                {t("dogs.delete")}
              </Button>
            )}
          </div>
        </div>
        {confirming && <p className="text-sm text-red-600">{t("dogHub.deleteConfirm")}</p>}
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label={t("dogHub.tabOverview")}>
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                isActive
                  ? "border-b-2 border-slate px-3 py-2 text-sm font-medium text-slate"
                  : "border-b-2 border-transparent px-3 py-2 text-sm text-slate-soft hover:text-slate"
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
