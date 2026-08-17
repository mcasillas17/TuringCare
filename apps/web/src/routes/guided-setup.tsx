import { AbandonSetupButton } from "@/components/guided-setup/abandon-setup-button";
import { DogBasicsStep } from "@/components/guided-setup/dog-basics-step";
import { IntentStep } from "@/components/guided-setup/intent-step";
import { SetupShell } from "@/components/guided-setup/setup-shell";
import { useI18n } from "@/i18n";
import { useGuidedSetup } from "@/lib/guided-setup";
import type { GuidedSetupRecord } from "@turingcare/shared";
import { useState } from "react";
import { Navigate } from "react-router-dom";

export function GuidedSetup({ allowNewDog = false }: { allowNewDog?: boolean }) {
  const { t } = useI18n();
  const setupQuery = useGuidedSetup();
  const [startedSetup, setStartedSetup] = useState<GuidedSetupRecord | null>(null);
  const [hasStartedSetup, setHasStartedSetup] = useState(false);

  if (setupQuery.isLoading) {
    return <p>{t("common.loading")}</p>;
  }

  if (setupQuery.isError || !setupQuery.data) {
    return <p className="text-red-600">{t("guidedSetup.loadError")}</p>;
  }

  const active = hasStartedSetup ? startedSetup : setupQuery.data.active;
  if (!active) {
    if (!allowNewDog && (!setupQuery.data.autoStartEligible || hasStartedSetup)) {
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
