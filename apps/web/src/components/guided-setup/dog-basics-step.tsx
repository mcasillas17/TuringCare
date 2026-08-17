import { SetupShell } from "@/components/guided-setup/setup-shell";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import {
  type GuidedSetupErrorMessageKey,
  guidedSetupErrorMessageKey,
  isGuidedSetupConflict,
  useGuidedSetup,
  useStartGuidedSetup,
} from "@/lib/guided-setup";
import { zodResolver } from "@hookform/resolvers/zod";
import { type DogProfile, type GuidedSetupRecord, dogProfileSchema } from "@turingcare/shared";
import { useState } from "react";
import { type FieldError, useForm } from "react-hook-form";

type DogBasicsStepProps = {
  onStarted: (setup: GuidedSetupRecord | null) => void;
};

const inputClassName =
  "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper";

type BasicsField = "name" | "breed" | "size" | "sex" | "source" | "vaccineStage";

export function DogBasicsStep({ onStarted }: DogBasicsStepProps) {
  const { t } = useI18n();
  const start = useStartGuidedSetup();
  const { refetch: refetchGuidedSetup } = useGuidedSetup();
  const [submitError, setSubmitError] = useState<GuidedSetupErrorMessageKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DogProfile>({
    resolver: zodResolver(dogProfileSchema),
    defaultValues: {
      size: "medium",
      sex: "female",
      spayedNeutered: false,
      source: "rescue",
      vaccineStage: "unknown",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const breed = values.breed?.trim();
      const profile: DogProfile = {
        name: values.name,
        size: values.size,
        sex: values.sex,
        spayedNeutered: false,
        source: values.source,
        vaccineStage: values.vaccineStage,
        ...(breed ? { breed } : {}),
      };
      const response = await start.mutateAsync(profile);
      onStarted(response.setup);
    } catch (error) {
      if (isGuidedSetupConflict(error, "active_setup_exists")) {
        try {
          const reconciled = await refetchGuidedSetup({ throwOnError: true });
          if (reconciled.isError || reconciled.error || !reconciled.data?.active) {
            setSubmitError(guidedSetupErrorMessageKey(error));
            return;
          }
          onStarted(reconciled.data.active);
          return;
        } catch {
          setSubmitError(guidedSetupErrorMessageKey(error));
          return;
        }
      }
      setSubmitError(guidedSetupErrorMessageKey(error));
    } finally {
      setSubmitting(false);
    }
  });

  const busy = submitting || isSubmitting || start.isPending;

  function fieldErrorMessage(field: BasicsField, error: FieldError | undefined) {
    if (!error) return undefined;
    if (field === "name") {
      return error.type === "too_big"
        ? t("guidedSetup.nameTooLong")
        : t("guidedSetup.nameRequired");
    }
    if (field === "breed") {
      return error.type === "too_big"
        ? t("guidedSetup.breedTooLong")
        : t("guidedSetup.breedInvalid");
    }
    if (field === "size") return t("guidedSetup.sizeInvalid");
    if (field === "sex") return t("guidedSetup.sexInvalid");
    if (field === "source") return t("guidedSetup.sourceInvalid");
    return t("guidedSetup.vaccineStageInvalid");
  }

  const nameError = fieldErrorMessage("name", errors.name);
  const breedError = fieldErrorMessage("breed", errors.breed);
  const sizeError = fieldErrorMessage("size", errors.size);
  const sexError = fieldErrorMessage("sex", errors.sex);
  const sourceError = fieldErrorMessage("source", errors.source);
  const vaccineStageError = fieldErrorMessage("vaccineStage", errors.vaccineStage);

  return (
    <SetupShell
      step={1}
      title={t("guidedSetup.basicsTitle")}
      description={t("guidedSetup.basicsDescription")}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="block space-y-1">
          <label htmlFor="guided-setup-name" className="text-sm font-medium text-slate">
            {t("dogs.fieldName")}
          </label>
          <input
            id="guided-setup-name"
            className={inputClassName}
            aria-invalid={nameError ? "true" : undefined}
            aria-describedby={nameError ? "guided-setup-name-error" : undefined}
            {...register("name")}
          />
          {nameError && (
            <p id="guided-setup-name-error" role="alert" className="text-xs text-red-600">
              {nameError}
            </p>
          )}
        </div>
        <div className="block space-y-1">
          <label htmlFor="guided-setup-breed" className="text-sm font-medium text-slate">
            {t("dogs.fieldBreed")}
          </label>
          <input
            id="guided-setup-breed"
            className={inputClassName}
            aria-invalid={breedError ? "true" : undefined}
            aria-describedby={breedError ? "guided-setup-breed-error" : undefined}
            {...register("breed", { setValueAs: (value: string) => value.trim() || undefined })}
          />
          {breedError && (
            <p id="guided-setup-breed-error" role="alert" className="text-xs text-red-600">
              {breedError}
            </p>
          )}
        </div>
        <div className="block space-y-1">
          <label htmlFor="guided-setup-size" className="text-sm font-medium text-slate">
            {t("dogs.fieldSize")}
          </label>
          <select
            id="guided-setup-size"
            className={inputClassName}
            aria-invalid={sizeError ? "true" : undefined}
            aria-describedby={sizeError ? "guided-setup-size-error" : undefined}
            {...register("size")}
          >
            <option value="small">{t("dogs.sizeSmall")}</option>
            <option value="medium">{t("dogs.sizeMedium")}</option>
            <option value="large">{t("dogs.sizeLarge")}</option>
            <option value="giant">{t("dogs.sizeGiant")}</option>
          </select>
          {sizeError && (
            <p id="guided-setup-size-error" role="alert" className="text-xs text-red-600">
              {sizeError}
            </p>
          )}
        </div>
        <div className="block space-y-1">
          <label htmlFor="guided-setup-sex" className="text-sm font-medium text-slate">
            {t("dogs.fieldSex")}
          </label>
          <select
            id="guided-setup-sex"
            className={inputClassName}
            aria-invalid={sexError ? "true" : undefined}
            aria-describedby={sexError ? "guided-setup-sex-error" : undefined}
            {...register("sex")}
          >
            <option value="male">{t("dogs.sexMale")}</option>
            <option value="female">{t("dogs.sexFemale")}</option>
          </select>
          {sexError && (
            <p id="guided-setup-sex-error" role="alert" className="text-xs text-red-600">
              {sexError}
            </p>
          )}
        </div>
        <div className="block space-y-1">
          <label htmlFor="guided-setup-source" className="text-sm font-medium text-slate">
            {t("dogs.fieldSource")}
          </label>
          <select
            id="guided-setup-source"
            className={inputClassName}
            aria-invalid={sourceError ? "true" : undefined}
            aria-describedby={sourceError ? "guided-setup-source-error" : undefined}
            {...register("source")}
          >
            <option value="breeder">{t("dogs.sourceBreeder")}</option>
            <option value="rescue">{t("dogs.sourceRescue")}</option>
            <option value="shelter">{t("dogs.sourceShelter")}</option>
            <option value="other">{t("dogs.sourceOther")}</option>
          </select>
          {sourceError && (
            <p id="guided-setup-source-error" role="alert" className="text-xs text-red-600">
              {sourceError}
            </p>
          )}
        </div>
        <div className="block space-y-1">
          <label htmlFor="guided-setup-vaccine-stage" className="text-sm font-medium text-slate">
            {t("dogs.fieldVaccineStage")}
          </label>
          <select
            id="guided-setup-vaccine-stage"
            className={inputClassName}
            aria-invalid={vaccineStageError ? "true" : undefined}
            aria-describedby={vaccineStageError ? "guided-setup-vaccine-stage-error" : undefined}
            {...register("vaccineStage")}
          >
            <option value="in_progress">{t("dogs.vaccineInProgress")}</option>
            <option value="complete">{t("dogs.vaccineComplete")}</option>
            <option value="unknown">{t("dogs.vaccineUnknown")}</option>
          </select>
          {vaccineStageError && (
            <p id="guided-setup-vaccine-stage-error" role="alert" className="text-xs text-red-600">
              {vaccineStageError}
            </p>
          )}
        </div>
        {submitError && (
          <p role="alert" className="text-sm text-red-600">
            {t(submitError)}
          </p>
        )}
        <Button type="submit" disabled={busy} className="bg-slate text-cream">
          {busy ? t("guidedSetup.saving") : t("guidedSetup.continue")}
        </Button>
      </form>
    </SetupShell>
  );
}
