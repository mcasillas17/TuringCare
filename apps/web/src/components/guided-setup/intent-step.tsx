import { AbandonSetupButton } from "@/components/guided-setup/abandon-setup-button";
import { SetupShell } from "@/components/guided-setup/setup-shell";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import {
  isGuidedSetupConflict,
  useGuidedSetup,
  useSaveGuidedSetupIntent,
} from "@/lib/guided-setup";
import type { GuidedSetupIntent, GuidedSetupRecord } from "@turingcare/shared";
import { type FormEvent, useState } from "react";

type IntentStepProps = {
  setup: GuidedSetupRecord;
  onSaved: (setup: GuidedSetupRecord | null) => void;
};

const intents: ReadonlyArray<{
  value: GuidedSetupIntent;
  titleKey:
    | "guidedSetup.intentUnderstandTitle"
    | "guidedSetup.intentTrainTitle"
    | "guidedSetup.intentTrackTitle";
  descriptionKey:
    | "guidedSetup.intentUnderstandDescription"
    | "guidedSetup.intentTrainDescription"
    | "guidedSetup.intentTrackDescription";
}> = [
  {
    value: "understand_behavior",
    titleKey: "guidedSetup.intentUnderstandTitle",
    descriptionKey: "guidedSetup.intentUnderstandDescription",
  },
  {
    value: "train_skill",
    titleKey: "guidedSetup.intentTrainTitle",
    descriptionKey: "guidedSetup.intentTrainDescription",
  },
  {
    value: "track_progress",
    titleKey: "guidedSetup.intentTrackTitle",
    descriptionKey: "guidedSetup.intentTrackDescription",
  },
];

export function IntentStep({ setup, onSaved }: IntentStepProps) {
  const { t } = useI18n();
  const saveIntent = useSaveGuidedSetupIntent();
  const { refetch: refetchGuidedSetup } = useGuidedSetup();
  const [intent, setIntent] = useState<GuidedSetupIntent | "">(setup.intent ?? "");
  const [requiredError, setRequiredError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!intent) {
      setRequiredError(true);
      setSaveError(false);
      return;
    }
    setRequiredError(false);
    setSaveError(false);
    setSubmitting(true);
    try {
      const response = await saveIntent.mutateAsync({ setupId: setup.id, intent });
      onSaved(response.setup);
    } catch (error) {
      if (isGuidedSetupConflict(error, "setup_already_completed")) {
        try {
          const reconciled = await refetchGuidedSetup({ throwOnError: true });
          if (reconciled.isError || reconciled.error || !reconciled.data) {
            setSaveError(true);
            return;
          }
          onSaved(reconciled.data.active);
          return;
        } catch {
          setSaveError(true);
          return;
        }
      }
      setSaveError(true);
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting || saveIntent.isPending;

  return (
    <SetupShell
      step={2}
      title={t("guidedSetup.intentTitle")}
      description={t("guidedSetup.intentDescription")}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <fieldset
          role="radiogroup"
          aria-labelledby="guided-setup-intent-question"
          className="space-y-3"
        >
          <legend
            id="guided-setup-intent-question"
            className="mb-3 text-lg font-semibold text-slate"
          >
            {t("guidedSetup.question", { dog: setup.dogName ?? "" })}
          </legend>
          {intents.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer gap-3 rounded border border-silver bg-white p-4 motion-safe:transition-colors motion-reduce:transition-none hover:border-copper"
            >
              <input
                type="radio"
                name="guided-setup-intent"
                value={option.value}
                checked={intent === option.value}
                onChange={() => {
                  setIntent(option.value);
                  setRequiredError(false);
                }}
                className="mt-1 size-4 accent-copper"
              />
              <span>
                <span className="block font-semibold text-slate">{t(option.titleKey)}</span>
                <span className="block text-sm text-slate-soft">{t(option.descriptionKey)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {requiredError && (
          <p role="alert" className="text-sm text-red-600">
            {t("guidedSetup.selectionRequired")}
          </p>
        )}
        {saveError && (
          <p role="alert" className="text-sm text-red-600">
            {t("guidedSetup.intentError")}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy} className="bg-slate text-cream">
            {busy ? t("guidedSetup.saving") : t("guidedSetup.continue")}
          </Button>
          <AbandonSetupButton setupId={setup.id} />
        </div>
      </form>
    </SetupShell>
  );
}
