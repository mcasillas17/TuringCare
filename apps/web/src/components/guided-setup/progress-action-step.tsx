import { AbandonSetupButton } from "@/components/guided-setup/abandon-setup-button";
import { SetupShell } from "@/components/guided-setup/setup-shell";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type GuidedProgressActionResponse, useCompleteProgressSetup } from "@/lib/guided-setup";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type GuidedSetupProgressAction,
  guidedSetupProgressActionSchema,
  journalTrendValues,
} from "@turingcare/shared";
import { useRef, useState } from "react";
import { type FieldError, useForm } from "react-hook-form";

const inputClassName =
  "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper";

type ProgressActionStepProps = {
  setup: {
    id: string;
    dogName: string | null;
  };
  onCompleted: (response: GuidedProgressActionResponse) => void;
  onBack: () => void;
  onSkip: () => void;
  skipPending: boolean;
  skipError: boolean;
};

const trendLabels = {
  better: "guidedSetup.progressTrendBetter",
  same: "guidedSetup.progressTrendSame",
  harder: "guidedSetup.progressTrendHarder",
} as const;

export function ProgressActionStep({
  setup,
  onCompleted,
  onBack,
  onSkip,
  skipPending,
  skipError,
}: ProgressActionStepProps) {
  const { t } = useI18n();
  const [submitError, setSubmitError] = useState(false);
  const submitLock = useRef(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GuidedSetupProgressAction>({
    resolver: zodResolver(guidedSetupProgressActionSchema),
    defaultValues: {
      setupId: setup.id,
      trend: undefined,
      note: "",
    },
  });
  const complete = useCompleteProgressSetup({ onCompleted });
  const busy = isSubmitting || complete.isPending || skipPending;

  async function submit(values: GuidedSetupProgressAction) {
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitError(false);
    try {
      await complete.mutateAsync(values);
    } catch {
      setSubmitError(true);
    } finally {
      submitLock.current = false;
    }
  }

  function fieldError(field: "trend" | "note", error: FieldError | undefined) {
    if (!error) return undefined;
    return field === "trend"
      ? t("guidedSetup.progressTrendRequired")
      : error.type === "too_big"
        ? t("guidedSetup.progressNoteInvalid")
        : t("guidedSetup.progressNoteRequired");
  }

  const trendError = fieldError("trend", errors.trend);
  const noteError = fieldError("note", errors.note);

  return (
    <SetupShell
      step={3}
      title={t("guidedSetup.progressTitle")}
      description={t("guidedSetup.progressDescription", { dog: setup.dogName ?? "" })}
    >
      <form onSubmit={handleSubmit(submit)} className="space-y-5">
        <input type="hidden" {...register("setupId")} />
        <p className="text-sm text-slate-soft">{t("guidedSetup.progressGuidance")}</p>
        <fieldset
          role="radiogroup"
          aria-labelledby="guided-setup-progress-trend-label"
          aria-describedby={trendError ? "guided-setup-trend-error" : undefined}
          className="space-y-3"
        >
          <legend id="guided-setup-progress-trend-label" className="text-sm font-medium text-slate">
            {t("guidedSetup.progressTrendLabel")}
          </legend>
          {journalTrendValues.map((trend) => (
            <label
              key={trend}
              className="flex cursor-pointer gap-3 rounded border border-silver bg-white p-3 hover:border-copper"
            >
              <input
                type="radio"
                value={trend}
                className="mt-1 size-4 accent-copper"
                aria-invalid={trendError ? "true" : undefined}
                {...register("trend")}
              />
              <span className="text-sm text-slate">{t(trendLabels[trend])}</span>
            </label>
          ))}
        </fieldset>
        {trendError && (
          <p id="guided-setup-trend-error" role="alert" className="text-sm text-red-600">
            {trendError}
          </p>
        )}

        <div className="block space-y-1">
          <label
            id="guided-setup-note-label"
            htmlFor="guided-setup-note"
            className="text-sm font-medium text-slate"
          >
            {t("guidedSetup.progressNoteLabel")}
          </label>
          <textarea
            id="guided-setup-note"
            rows={3}
            className={inputClassName}
            placeholder={t("guidedSetup.progressNotePlaceholder")}
            aria-invalid={noteError ? "true" : undefined}
            aria-labelledby="guided-setup-note-label"
            aria-describedby={noteError ? "guided-setup-note-error" : undefined}
            {...register("note")}
          />
          {noteError && (
            <span id="guided-setup-note-error" role="alert" className="text-xs text-red-600">
              {noteError}
            </span>
          )}
        </div>
        {submitError && (
          <p role="alert" className="text-sm text-red-600">
            {t("guidedSetup.progressError")}
          </p>
        )}
        {skipError && (
          <p role="alert" className="text-sm text-red-600">
            {t("guidedSetup.skipError")}
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
          <AbandonSetupButton setupId={setup.id} />
        </div>
      </form>
    </SetupShell>
  );
}
