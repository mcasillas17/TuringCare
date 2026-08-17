import { SetupShell } from "@/components/guided-setup/setup-shell";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useStartGuidedSetup } from "@/lib/guided-setup";
import { zodResolver } from "@hookform/resolvers/zod";
import { type DogProfile, type GuidedSetupRecord, dogProfileSchema } from "@turingcare/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";

type DogBasicsStepProps = {
  onStarted: (setup: GuidedSetupRecord) => void;
};

const inputClassName =
  "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper";

export function DogBasicsStep({ onStarted }: DogBasicsStepProps) {
  const { t } = useI18n();
  const start = useStartGuidedSetup();
  const [submitError, setSubmitError] = useState(false);
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
    setSubmitError(false);
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
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  });

  const busy = submitting || isSubmitting || start.isPending;

  return (
    <SetupShell
      step={1}
      title={t("guidedSetup.basicsTitle")}
      description={t("guidedSetup.basicsDescription")}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldName")}</span>
          <input
            className={inputClassName}
            aria-invalid={errors.name ? "true" : undefined}
            {...register("name")}
          />
          {errors.name && (
            <span className="text-xs text-red-600">{t("guidedSetup.requiredField")}</span>
          )}
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldBreed")}</span>
          <input
            className={inputClassName}
            {...register("breed", { setValueAs: (value: string) => value.trim() || undefined })}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldSize")}</span>
          <select className={inputClassName} {...register("size")}>
            <option value="small">{t("dogs.sizeSmall")}</option>
            <option value="medium">{t("dogs.sizeMedium")}</option>
            <option value="large">{t("dogs.sizeLarge")}</option>
            <option value="giant">{t("dogs.sizeGiant")}</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldSex")}</span>
          <select className={inputClassName} {...register("sex")}>
            <option value="male">{t("dogs.sexMale")}</option>
            <option value="female">{t("dogs.sexFemale")}</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldSource")}</span>
          <select className={inputClassName} {...register("source")}>
            <option value="breeder">{t("dogs.sourceBreeder")}</option>
            <option value="rescue">{t("dogs.sourceRescue")}</option>
            <option value="shelter">{t("dogs.sourceShelter")}</option>
            <option value="other">{t("dogs.sourceOther")}</option>
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldVaccineStage")}</span>
          <select className={inputClassName} {...register("vaccineStage")}>
            <option value="in_progress">{t("dogs.vaccineInProgress")}</option>
            <option value="complete">{t("dogs.vaccineComplete")}</option>
            <option value="unknown">{t("dogs.vaccineUnknown")}</option>
          </select>
        </label>
        {submitError && (
          <p role="alert" className="text-sm text-red-600">
            {t("guidedSetup.startError")}
          </p>
        )}
        <Button type="submit" disabled={busy} className="bg-slate text-cream">
          {busy ? t("guidedSetup.saving") : t("guidedSetup.continue")}
        </Button>
      </form>
    </SetupShell>
  );
}
