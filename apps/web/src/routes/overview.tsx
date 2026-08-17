import { OnboardingChecklist } from "@/components/onboarding/checklist";
import { useI18n } from "@/i18n";
import { useGuidedSetup } from "@/lib/guided-setup";
import { useOverview } from "@/lib/overview";
import { Link, Navigate } from "react-router-dom";

type FirstRunStage = "new" | "noEntries" | "noBrief" | "ready";

function deriveStage(
  dogCount: number,
  entryCount: number,
  briefStatus: string | null | undefined,
): FirstRunStage {
  if (dogCount === 0) return "new";
  if (entryCount === 0) return "noEntries";
  if (briefStatus !== "finalized") return "noBrief";
  return "ready";
}

export function Overview() {
  const { t } = useI18n();
  const { data: o, isLoading, isError } = useOverview();
  const {
    data: guidedSetup,
    isLoading: isGuidedSetupLoading,
    isError: isGuidedSetupError,
    isFetching: isGuidedSetupFetching,
    refetch: refetchGuidedSetup,
  } = useGuidedSetup();

  if (isLoading || isGuidedSetupLoading) return <p>{t("common.loading")}</p>;
  const guidedSetupUnavailable = isGuidedSetupError || !guidedSetup;
  if (!guidedSetupUnavailable && (guidedSetup.autoStartEligible || guidedSetup.active)) {
    return <Navigate to="/my/setup" replace />;
  }
  if (isError || !o) return <p className="text-red-600">{t("dogs.loadError")}</p>;

  const stage = deriveStage(o.dogCount, o.journalEntryCount, o.latestBrief?.status ?? null);
  const guidedSetupWarning = guidedSetupUnavailable ? (
    <section
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded border border-copper bg-cream p-4"
    >
      <p className="text-sm text-slate">{t("guidedSetup.overviewWarning")}</p>
      <button
        type="button"
        onClick={() => void refetchGuidedSetup()}
        disabled={isGuidedSetupFetching}
        className="rounded bg-slate px-3 py-1 text-sm text-cream disabled:opacity-60"
      >
        {t("guidedSetup.retry")}
      </button>
    </section>
  ) : null;

  if (stage === "new") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {guidedSetupWarning}
        <OnboardingChecklist />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {guidedSetupWarning}
      <div className="mx-auto max-w-2xl">
        <OnboardingChecklist />
      </div>
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
      {stage === "noBrief" && (
        <section className="space-y-2 rounded border border-silver bg-white p-4">
          <h2 className="font-semibold text-slate">{t("overview.nudgeNoBriefTitle")}</h2>
          <p className="text-slate-soft text-sm">{t("overview.nudgeNoBriefBody")}</p>
          <Link
            to="/my/brief"
            className="inline-block rounded bg-slate px-3 py-1 text-sm text-cream"
          >
            {t("overview.nudgeNoBriefCta")}
          </Link>
        </section>
      )}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-4">
          <section>
            <h2 className="mb-2 font-semibold text-slate">{t("overview.recent")}</h2>
            {stage === "noEntries" ? (
              <div className="space-y-2 rounded border border-silver bg-white p-4">
                <h3 className="font-semibold text-slate">{t("overview.nudgeNoEntriesTitle")}</h3>
                <p className="text-slate-soft text-sm">{t("overview.nudgeNoEntriesBody")}</p>
                <Link
                  to="/my/journal"
                  className="inline-block rounded bg-slate px-3 py-1 text-sm text-cream"
                >
                  {t("overview.nudgeNoEntriesCta")}
                </Link>
              </div>
            ) : o.recentActivity.length === 0 ? (
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
          <Link to="/my/journal" className="block rounded bg-slate p-2 text-center text-cream">
            {t("overview.qLog")}
          </Link>
          <Link
            to="/my/dogs/new"
            className="block rounded border border-silver bg-white p-2 text-center"
          >
            {t("overview.qAddDog")}
          </Link>
          <Link
            to="/my/brief"
            className="block rounded border border-silver bg-white p-2 text-center"
          >
            {t("overview.qBrief")}
          </Link>
          <Link
            to="/trainers"
            className="block rounded border border-silver bg-white p-2 text-center"
          >
            {t("overview.qTrainer")}
          </Link>
        </div>
      </div>
    </div>
  );
}
