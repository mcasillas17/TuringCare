import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { DIMENSION_CONFIG, OUTCOME_KEYS, SAFETY_SIGNAL_KEYS } from "@/lib/practice-options";
import { useLogSession } from "@/lib/progress";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type PracticeDimension,
  type PracticeSessionInput,
  practiceOutcomeValues,
  practiceSessionSchema,
  safetySignalValues,
} from "@turingcare/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

function localDateTime() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function SessionForm({
  dogId,
  skillId,
  dimensions,
  onCancel,
  onSaved,
}: {
  dogId: string;
  skillId: string;
  dimensions: PracticeDimension[];
  onCancel: () => void;
  onSaved?: () => void;
}) {
  const { t } = useI18n();
  const logSession = useLogSession(dogId);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PracticeSessionInput>({
    resolver: zodResolver(practiceSessionSchema),
    defaultValues: { occurredAt: localDateTime() },
  });
  const selectedSafetySignal = watch("safetySignal");
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);

  const onSubmit = handleSubmit(async (body) => {
    if (body.safetySignal && !safetyConfirmed) {
      toast.error(t("practice.safetyConfirm"));
      return;
    }
    try {
      const occurredAt = new Date(body.occurredAt);
      await logSession.mutateAsync({
        skillId,
        body: {
          ...body,
          occurredAt: occurredAt.toISOString(),
          timezoneOffsetMinutes: occurredAt.getTimezoneOffset(),
        },
      });
      toast.success(t("progress.saved"));
      onSaved?.();
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "future_practice_session"
          ? t("practice.futureSession")
          : t("progress.saveFailed"),
      );
    }
  });

  return (
    <form
      className="space-y-3 rounded border border-silver bg-cream p-3"
      onSubmit={(event) => {
        event.stopPropagation();
        onSubmit();
      }}
    >
      <label className="block">
        <span className="text-sm">{t("progress.occurredAt")}</span>
        <input
          type="datetime-local"
          max={localDateTime()}
          className={input}
          {...register("occurredAt")}
        />
        {errors.occurredAt && (
          <span className="text-xs text-red-600">{errors.occurredAt.message}</span>
        )}
      </label>
      <label className="block">
        <span className="text-sm">{t("progress.duration")}</span>
        <input
          type="number"
          min={0}
          className={input}
          placeholder={t("progress.durationOptional")}
          {...register("durationMinutes", {
            setValueAs: (v) =>
              v === "" || v == null || Number.isNaN(Number(v)) ? undefined : Number(v),
          })}
        />
      </label>
      <label className="block">
        <span className="text-sm">{t("progress.notes")}</span>
        <textarea
          rows={2}
          className={input}
          placeholder={t("progress.notesOptional")}
          {...register("notes", { setValueAs: (v) => v || undefined })}
        />
      </label>
      <label className="block">
        <span className="text-sm">{t("practice.outcomeQuestion")}</span>
        <select
          className={input}
          aria-label={t("practice.outcomeQuestion")}
          {...register("outcome", { setValueAs: (v) => v || undefined })}
        >
          <option value="">{t("practice.outcomeSkip")}</option>
          {practiceOutcomeValues.map((value) => (
            <option key={value} value={value}>
              {t(OUTCOME_KEYS[value])}
            </option>
          ))}
        </select>
      </label>
      {dimensions.map((dimension) => {
        const group = DIMENSION_CONFIG[dimension];
        return (
          <label className="block" key={dimension}>
            <span className="text-sm">{t(group.labelKey)}</span>
            <select
              className={input}
              aria-label={t(group.labelKey)}
              {...register(group.field, { setValueAs: (v) => v || undefined })}
            >
              <option value="">{t("practice.contextOptional")}</option>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      <label className="block">
        <span className="text-sm">{t("practice.safetyLabel")}</span>
        <select
          className={input}
          aria-label={t("practice.safetyLabel")}
          {...register("safetySignal", {
            setValueAs: (v) => v || undefined,
            onChange: () => setSafetyConfirmed(false),
          })}
        >
          <option value="">{t("practice.safetyNone")}</option>
          {safetySignalValues.map((value) => (
            <option key={value} value={value}>
              {t(SAFETY_SIGNAL_KEYS[value])}
            </option>
          ))}
        </select>
      </label>
      {selectedSafetySignal && (
        <label className="block text-sm">
          <input
            type="checkbox"
            checked={safetyConfirmed}
            onChange={(event) => setSafetyConfirmed(event.target.checked)}
          />
          {t("practice.safetyConfirm")}
        </label>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting || logSession.isPending}>
          {isSubmitting || logSession.isPending ? t("progress.saving") : t("progress.save")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("progress.cancel")}
        </Button>
      </div>
    </form>
  );
}
