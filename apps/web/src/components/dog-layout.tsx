import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDeleteDog, useDog } from "@/lib/dogs";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

type DeleteRequest = {
  token: number;
  dogId: string;
  pathname: string;
  lifecycle: symbol;
};

export function DogLayout() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { id = "" } = useParams();
  const { data, isLoading, isError } = useDog(id);
  const del = useDeleteDog();
  const [confirming, setConfirming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const routeRef = useRef({ dogId: id, pathname });
  const deleteTokenRef = useRef(0);
  const deleteRequestRef = useRef<DeleteRequest | null>(null);
  const lifecycleRef = useRef<symbol | null>(null);

  routeRef.current = { dogId: id, pathname };

  useEffect(() => {
    const lifecycle = Symbol();
    lifecycleRef.current = lifecycle;
    return () => {
      if (lifecycleRef.current === lifecycle) {
        lifecycleRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!pathname) return;
    setConfirming(false);
    setDeleteError(null);
  }, [pathname]);

  if (isLoading) return null;
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <p className="text-red-600">{t("dogHub.notFound")}</p>
        <Button asChild variant="outline">
          <Link to="/my/dogs">{t("dogHub.backToDashboard")}</Link>
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
  const isCurrentDeleteRequest = (request: DeleteRequest) => {
    const route = routeRef.current;
    return (
      deleteRequestRef.current?.token === request.token &&
      lifecycleRef.current === request.lifecycle &&
      route.dogId === request.dogId &&
      route.pathname === request.pathname
    );
  };

  const tabs = [
    { to: `/my/dogs/${dog.id}/journal`, label: t("dogHub.tabJournal"), end: false },
    { to: `/my/dogs/${dog.id}/training`, label: t("dogHub.tabTraining"), end: false },
    { to: `/my/dogs/${dog.id}/brief`, label: t("dogHub.tabBrief"), end: false },
    { to: `/my/dogs/${dog.id}/week`, label: t("dogHub.tabWeek"), end: false },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="sticky top-0 z-10 -mx-4 space-y-3 border-b border-silver bg-cream/95 px-4 pt-3 pb-2 backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <Link to="/my/dogs" className="text-xs text-slate-soft hover:underline">
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
                    const lifecycle = lifecycleRef.current;
                    if (!lifecycle) return;
                    const request: DeleteRequest = {
                      token: ++deleteTokenRef.current,
                      dogId: dog.id,
                      pathname,
                      lifecycle,
                    };
                    deleteRequestRef.current = request;
                    try {
                      await del.mutateAsync(dog.id);
                      if (!isCurrentDeleteRequest(request)) return;
                      deleteRequestRef.current = null;
                      setDeleteError(null);
                      setConfirming(false);
                      toast.success(t("dogs.deleted"));
                      navigate("/my/dogs");
                    } catch (error) {
                      if (!isCurrentDeleteRequest(request)) return;
                      deleteRequestRef.current = null;
                      if (error instanceof Error && error.message === "active_guided_setup") {
                        setConfirming(false);
                        setDeleteError(error.message);
                        return;
                      }
                      toast.error(t("dogs.saveFailed"));
                    }
                  }}
                  disabled={del.isPending}
                  aria-busy={del.isPending}
                  className="border-red-600 text-red-600"
                >
                  {t("dogs.deleteYes")}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setConfirming(false)}
                  disabled={del.isPending}
                >
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
        {deleteError === "active_guided_setup" && (
          <section
            role="alert"
            className="space-y-2 rounded border border-copper bg-cream p-3 text-sm text-slate"
          >
            <p>{t("guidedSetup.activeDeleteExplanation")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link className="font-medium underline" to="/my/setup">
                {t("guidedSetup.resumeBeforeDelete")}
              </Link>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDeleteError(null);
                  setConfirming(true);
                }}
                disabled={del.isPending}
              >
                {t("dogs.retryDelete")}
              </Button>
            </div>
          </section>
        )}
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label={t("dogHub.backToDashboard")}>
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
