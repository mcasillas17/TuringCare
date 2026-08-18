import { AbandonSetupButton } from "@/components/guided-setup/abandon-setup-button";
import { SetupShell } from "@/components/guided-setup/setup-shell";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import {
  type GuidedBehaviorActionResponse,
  type GuidedSetupErrorMessageKey,
  guidedSetupErrorMessageKey,
  isGuidedSetupReconciliationConflict,
  useCompleteBehaviorSetup,
} from "@/lib/guided-setup";
import { SAFETY_SIGNAL_KEYS } from "@/lib/practice-options";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type GuidedSetupBehaviorAction,
  guidedSetupBehaviorActionSchema,
  safetySignalValues,
} from "@turingcare/shared";
import { useRef, useState } from "react";
import { type FieldError, useForm } from "react-hook-form";

const inputClassName =
  "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper";

type BehaviorActionStepProps = {
  setup: {
    id: string;
    dogName: string | null;
  };
  onCompleted: (response: GuidedBehaviorActionResponse) => void;
  onReconcile: () => Promise<boolean>;
  onBack: () => void;
  onSkip: () => void;
  skipPending: boolean;
  skipError: GuidedSetupErrorMessageKey | null;
  abandonPending: boolean;
  onAbandonPendingChange: (pending: boolean) => void;
  canNavigateAfterAbandon: () => boolean;
};

export function BehaviorActionStep({
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
}: BehaviorActionStepProps) {
  const { t } = useI18n();
  const [submitError, setSubmitError] = useState<GuidedSetupErrorMessageKey | null>(null);
  const submitLock = useRef(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<GuidedSetupBehaviorAction>({
    resolver: zodResolver(guidedSetupBehaviorActionSchema),
    defaultValues: {
      setupId: setup.id,
      concern: "",
      severity: "mild",
      safetySignal: null,
      safetyConfirmed: false,
    },
  });
  const complete = useCompleteBehaviorSetup({ onCompleted });
  const severity = watch("severity");
  const safetySignal = watch("safetySignal");
  const safetyRequired = severity === "severe" || safetySignal != null;
  const busy = isSubmitting || complete.isPending || skipPending || abandonPending;

  async function submit(values: GuidedSetupBehaviorAction) {
    if (submitLock.current || abandonPending) return;
    submitLock.current = true;
    setSubmitError(null);
    try {
      await complete.mutateAsync(values);
    } catch (error) {
      if (isGuidedSetupReconciliationConflict(error)) {
        const reconciled = await onReconcile();
        if (reconciled) return;
      }
      setSubmitError(guidedSetupErrorMessageKey(error));
    } finally {
      submitLock.current = false;
    }
  }

  function fieldError(field: keyof GuidedSetupBehaviorAction, error: FieldError | undefined) {
    if (!error) return undefined;
    if (field === "concern") {
      return error.type === "too_big"
        ? t("guidedSetup.behaviorConcernInvalid")
        : t("guidedSetup.behaviorConcernRequired");
    }
    if (field === "severity") return t("guidedSetup.behaviorSeverityRequired");
    if (field === "safetySignal") return t("guidedSetup.behaviorSafetySignalInvalid");
    return t("guidedSetup.behaviorSafetyConfirmRequired");
  }

  const concernError = fieldError("concern", errors.concern);
  const severityError = fieldError("severity", errors.severity);
  const safetySignalError = fieldError("safetySignal", errors.safetySignal);
  const safetyConfirmedError = fieldError("safetyConfirmed", errors.safetyConfirmed);

  return (
    <SetupShell
      step={3}
      title={t("guidedSetup.behaviorTitle")}
      description={t("guidedSetup.behaviorDescription", { dog: setup.dogName ?? "" })}
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-5">
        <input type="hidden" {...register("setupId")} />
        <div className="block space-y-1">
          <label
            id="guided-setup-concern-label"
            htmlFor="guided-setup-concern"
            className="text-sm font-medium text-slate"
          >
            {t("guidedSetup.behaviorConcernLabel")}
          </label>
          <textarea
            id="guided-setup-concern"
            rows={3}
            className={inputClassName}
            placeholder={t("guidedSetup.behaviorConcernPlaceholder")}
            aria-invalid={concernError ? "true" : undefined}
            aria-labelledby="guided-setup-concern-label"
            aria-describedby={concernError ? "guided-setup-concern-error" : undefined}
            {...register("concern")}
          />
          {concernError && (
            <span id="guided-setup-concern-error" role="alert" className="text-xs text-red-600">
              {concernError}
            </span>
          )}
        </div>

        <div className="block space-y-1">
          <label
            id="guided-setup-severity-label"
            htmlFor="guided-setup-severity"
            className="text-sm font-medium text-slate"
          >
            {t("guidedSetup.behaviorSeverityLabel")}
          </label>
          <select
            id="guided-setup-severity"
            className={inputClassName}
            aria-invalid={severityError ? "true" : undefined}
            aria-labelledby="guided-setup-severity-label"
            aria-describedby={severityError ? "guided-setup-severity-error" : undefined}
            {...register("severity", {
              onChange: () => setValue("safetyConfirmed", false),
            })}
          >
            <option value="mild">{t("guidedSetup.severityMild")}</option>
            <option value="moderate">{t("guidedSetup.severityModerate")}</option>
            <option value="severe">{t("guidedSetup.severitySevere")}</option>
          </select>
          {severityError && (
            <span id="guided-setup-severity-error" role="alert" className="text-xs text-red-600">
              {severityError}
            </span>
          )}
        </div>

        <div className="block space-y-1">
          <label
            id="guided-setup-safety-signal-label"
            htmlFor="guided-setup-safety-signal"
            className="text-sm font-medium text-slate"
          >
            {t("guidedSetup.safetySignalLabel")}
          </label>
          <select
            id="guided-setup-safety-signal"
            className={inputClassName}
            aria-invalid={safetySignalError ? "true" : undefined}
            aria-labelledby="guided-setup-safety-signal-label"
            aria-describedby={safetySignalError ? "guided-setup-safety-signal-error" : undefined}
            {...register("safetySignal", {
              setValueAs: (value) => value || null,
              onChange: () => setValue("safetyConfirmed", false),
            })}
          >
            <option value="">{t("guidedSetup.safetySignalNone")}</option>
            {safetySignalValues.map((value) => (
              <option key={value} value={value}>
                {t(SAFETY_SIGNAL_KEYS[value])}
              </option>
            ))}
          </select>
          {safetySignalError && (
            <span
              id="guided-setup-safety-signal-error"
              role="alert"
              className="text-xs text-red-600"
            >
              {safetySignalError}
            </span>
          )}
        </div>

        {safetyRequired && (
          <label
            className="flex items-start gap-2 text-sm text-slate"
            htmlFor="guided-setup-safety"
          >
            <input
              id="guided-setup-safety"
              type="checkbox"
              className="mt-1 size-4 accent-copper"
              aria-invalid={safetyConfirmedError ? "true" : undefined}
              aria-describedby={safetyConfirmedError ? "guided-setup-safety-error" : undefined}
              {...register("safetyConfirmed")}
            />
            <span>{t("practice.safetyConfirm")}</span>
          </label>
        )}
        {safetyConfirmedError && (
          <p id="guided-setup-safety-error" role="alert" className="text-sm text-red-600">
            {safetyConfirmedError}
          </p>
        )}
        {submitError && (
          <p role="alert" className="text-sm text-red-600">
            {t(submitError)}
          </p>
        )}
        {skipError && (
          <p role="alert" className="text-sm text-red-600">
            {t(skipError)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy} className="bg-slate text-cream">
            {busy ? t("guidedSetup.saving") : t("guidedSetup.saveFirstStep")}
          </Button>
          <Button type="button" variant="outline" onClick={onBack} disabled={busy}>
            {t("guidedSetup.back")}
          </Button>
          <Button type="button" variant="outline" onClick={onSkip} disabled={busy}>
            {skipPending ? t("guidedSetup.saving") : t("guidedSetup.skip")}
          </Button>
          <AbandonSetupButton
            setupId={setup.id}
            disabled={busy}
            onPendingChange={onAbandonPendingChange}
            canNavigate={canNavigateAfterAbandon}
          />
        </div>
      </form>
    </SetupShell>
  );
}
