import { AbandonSetupButton } from "@/components/guided-setup/abandon-setup-button";
import { DogBasicsStep } from "@/components/guided-setup/dog-basics-step";
import { IntentStep } from "@/components/guided-setup/intent-step";
import { SetupShell } from "@/components/guided-setup/setup-shell";
import { useI18n } from "@/i18n";
import { useGuidedSetup } from "@/lib/guided-setup";
import type { GuidedSetupRecord, GuidedSetupStatus } from "@turingcare/shared";
import { useRef, useState } from "react";
import { Navigate } from "react-router-dom";

export function GuidedSetup({ allowNewDog = false }: { allowNewDog?: boolean }) {
  const { t } = useI18n();
  const setupQuery = useGuidedSetup();
  const lastKnownStatus = useRef<GuidedSetupStatus | undefined>(undefined);
  const [startedSetup, setStartedSetup] = useState<GuidedSetupRecord | null>(null);
  const [hasStartedSetup, setHasStartedSetup] = useState(false);

  if (setupQuery.data !== undefined) {
    lastKnownStatus.current = setupQuery.data;
  }
  const usableStatus = setupQuery.data ?? lastKnownStatus.current;
  const statusUnavailable = setupQuery.isError || setupQuery.data === undefined;

  if (setupQuery.isLoading && !usableStatus) {
    return <p>{t("common.loading")}</p>;
  }

  if (!usableStatus) {
    return (
      <section
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded border border-copper bg-cream p-4"
      >
        <p className="text-sm text-slate">{t("guidedSetup.loadError")}</p>
        <button
          type="button"
          onClick={() => void setupQuery.refetch()}
          disabled={setupQuery.isFetching}
          className="rounded bg-slate px-3 py-1 text-sm text-cream disabled:opacity-60"
        >
          {t("guidedSetup.retry")}
        </button>
      </section>
    );
  }

  const active = hasStartedSetup ? startedSetup : usableStatus.active;
  if (!active) {
    if (!allowNewDog && (!usableStatus.autoStartEligible || hasStartedSetup)) {
      return <Navigate to="/my" replace />;
    }
  }

  const step = active ? (active.currentStep === "intent" ? 2 : 3) : 1;
  const onStarted = (setup: GuidedSetupRecord | null) => {
    setStartedSetup(setup);
    setHasStartedSetup(true);
  };

  return (
    <>
      <output aria-live="polite" className="sr-only">
        {t("guidedSetup.stepAnnouncement", { step })}
      </output>
      {statusUnavailable && (
        <section
          role="alert"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded border border-copper bg-cream p-4"
        >
          <p className="text-sm text-slate">{t("guidedSetup.overviewWarning")}</p>
          <button
            type="button"
            onClick={() => void setupQuery.refetch()}
            disabled={setupQuery.isFetching}
            className="rounded bg-slate px-3 py-1 text-sm text-cream disabled:opacity-60"
          >
            {t("guidedSetup.retry")}
          </button>
        </section>
      )}
      {!active ? (
        <DogBasicsStep onStarted={onStarted} />
      ) : active.currentStep === "intent" ? (
        <IntentStep setup={active} onSaved={onStarted} />
      ) : (
        <SetupShell
          step={3}
          title={t("guidedSetup.actionTitle")}
          description={t("guidedSetup.actionDescription", { dog: active.dogName ?? "" })}
        >
          <div className="space-y-6">
            <section className="rounded border border-silver bg-white p-5 text-slate-soft">
              {t("guidedSetup.actionHandoff")}
            </section>
            <AbandonSetupButton setupId={active.id} />
          </div>
        </SetupShell>
      )}
    </>
  );
}
