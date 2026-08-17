import { AbandonSetupButton } from "@/components/guided-setup/abandon-setup-button";
import { SetupShell } from "@/components/guided-setup/setup-shell";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import {
  type GuidedSetupErrorMessageKey,
  type GuidedTrainingActionResponse,
  guidedSetupErrorMessageKey,
  isGuidedSetupReconciliationConflict,
  useCompleteTrainingSetup,
} from "@/lib/guided-setup";
import { useTrainingCatalog } from "@/lib/training-catalog";
import { weekKeyAtOffset } from "@/lib/week";
import type { CatalogTemplate, GuidedSetupRecord } from "@turingcare/shared";
import { useRef, useState } from "react";

export const TRAINING_TEMPLATE_KEYS = [
  "basic-manners",
  "puppy-fundamentals",
  "recall-reliability",
] as const;

const allowedTemplateKeys = new Set<string>(TRAINING_TEMPLATE_KEYS);

type TrainingActionStepProps = {
  setup: Pick<GuidedSetupRecord, "id" | "dogName">;
  onCompleted: (response: GuidedTrainingActionResponse) => void;
  onReconcile: () => Promise<boolean>;
  onBack: () => void;
  onSkip: () => void;
  skipPending: boolean;
  skipError: GuidedSetupErrorMessageKey | null;
  abandonPending: boolean;
  onAbandonPendingChange: (pending: boolean) => void;
  canNavigateAfterAbandon: () => boolean;
};

function isStaleConflict(error: unknown): boolean {
  return isGuidedSetupReconciliationConflict(error);
}

function allowedTemplates(catalog: CatalogTemplate[] | undefined) {
  return catalog?.filter((template) => allowedTemplateKeys.has(template.key)) ?? [];
}

export function TrainingActionStep({
  setup,
  onCompleted,
  onReconcile,
  onBack,
  onSkip,
  skipPending,
  skipError,
  abandonPending,
  onAbandonPendingChange,
  canNavigateAfterAbandon,
}: TrainingActionStepProps) {
  const { t } = useI18n();
  const catalogQuery = useTrainingCatalog();
  const templates = allowedTemplates(catalogQuery.data);
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<GuidedSetupErrorMessageKey | null>(null);
  const submitLock = useRef(false);
  const complete = useCompleteTrainingSetup({ onCompleted });
  const busy = complete.isPending || skipPending || abandonPending;

  async function submit() {
    if (submitLock.current || abandonPending || templateKey === null) return;
    submitLock.current = true;
    setSubmitError(null);
    const now = new Date();
    const timezoneOffsetMinutes = now.getTimezoneOffset();
    const body = {
      setupId: setup.id,
      templateKey,
      weekKey: weekKeyAtOffset(now, timezoneOffsetMinutes),
      timezoneOffsetMinutes,
    };
    try {
      await complete.mutateAsync(body);
    } catch (error) {
      if (isStaleConflict(error)) {
        try {
          if (await onReconcile()) return;
        } catch {
          // Keep the stale-state message below when reconciliation cannot load status.
        }
        setSubmitError(guidedSetupErrorMessageKey(error));
      } else {
        setSubmitError(guidedSetupErrorMessageKey(error));
      }
    } finally {
      submitLock.current = false;
    }
  }

  const controlsBusy = busy || submitLock.current;
  const errorMessage = submitError ? t(submitError) : null;

  return (
    <SetupShell
      step={3}
      title={t("guidedSetup.trainingTitle")}
      description={t("guidedSetup.trainingDescription", { dog: setup.dogName ?? "" })}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset
          role="radiogroup"
          aria-labelledby="guided-setup-training-template-label"
          className="space-y-3"
        >
          <legend
            id="guided-setup-training-template-label"
            className="text-sm font-medium text-slate"
          >
            {t("guidedSetup.trainingSelectLabel")}
          </legend>
          {catalogQuery.isLoading ? (
            <output className="rounded border border-silver bg-white p-4 text-sm text-slate">
              {t("guidedSetup.trainingCatalogLoading")}
            </output>
          ) : catalogQuery.isError ? (
            <p
              role="alert"
              className="rounded border border-copper bg-cream p-4 text-sm text-slate"
            >
              {t("guidedSetup.trainingCatalogError")}
            </p>
          ) : templates.length === 0 ? (
            <p className="rounded border border-silver bg-white p-4 text-sm text-slate">
              {t("guidedSetup.trainingCatalogEmpty")}
            </p>
          ) : (
            templates.map((template) => (
              <label
                key={template.key}
                className="flex cursor-pointer gap-3 rounded border border-silver bg-white p-3 hover:border-copper"
              >
                <input
                  type="radio"
                  name="guided-setup-training-template"
                  value={template.key}
                  checked={templateKey === template.key}
                  onChange={() => setTemplateKey(template.key)}
                  disabled={controlsBusy}
                  className="mt-1 size-4 accent-copper"
                />
                <span className="space-y-1 text-sm text-slate">
                  <span className="block font-medium">{template.name}</span>
                  <span className="block text-slate-soft">{template.description}</span>
                </span>
              </label>
            ))
          )}
        </fieldset>
        {errorMessage && (
          <p role="alert" className="text-sm text-red-600">
            {errorMessage}
          </p>
        )}
        {skipError && (
          <p role="alert" className="text-sm text-red-600">
            {t(skipError)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={controlsBusy || templateKey === null}>
            {controlsBusy ? t("guidedSetup.saving") : t("guidedSetup.saveFirstStep")}
          </Button>
          <Button type="button" variant="outline" onClick={onBack} disabled={controlsBusy}>
            {t("guidedSetup.back")}
          </Button>
          <Button type="button" variant="outline" onClick={onSkip} disabled={controlsBusy}>
            {skipPending ? t("guidedSetup.saving") : t("guidedSetup.skip")}
          </Button>
          <AbandonSetupButton
            setupId={setup.id}
            disabled={controlsBusy}
            onPendingChange={onAbandonPendingChange}
            canNavigate={canNavigateAfterAbandon}
          />
        </div>
      </form>
    </SetupShell>
  );
}
