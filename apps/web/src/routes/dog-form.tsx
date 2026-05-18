import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useCreateDog, useDog, useUpdateDog } from "@/lib/dogs";
import { zodResolver } from "@hookform/resolvers/zod";
import { type DogProfile, dogProfileSchema } from "@turingcare/shared";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

const inputCls = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function DogForm({ mode }: { mode: "create" | "edit" }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const create = useCreateDog();
  const update = useUpdateDog(id ?? "");
  const { data: dogData, isLoading, isError } = useDog(mode === "edit" ? (id ?? "") : "");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DogProfile>({
    resolver: zodResolver(dogProfileSchema),
    defaultValues: { spayedNeutered: false },
  });

  useEffect(() => {
    if (mode === "edit" && dogData?.dog) {
      const dog = dogData.dog;
      reset({
        name: dog.name,
        breed: dog.breed ?? "",
        size: dog.size,
        sex: dog.sex,
        source: dog.source,
        vaccineStage: dog.vaccineStage,
        spayedNeutered: dog.spayedNeutered,
        notes: dog.notes ?? "",
      });
    }
  }, [mode, dogData, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const dog =
        mode === "create" ? await create.mutateAsync(values) : await update.mutateAsync(values);
      toast.success(t("dogs.saved"));
      navigate(dog ? `/app/dogs/${dog.id}` : "/app");
    } catch {
      toast.error(t("dogs.saveFailed"));
    }
  });

  if (mode === "edit" && isLoading) {
    return <p className="p-8">{t("common.loading")}</p>;
  }
  if (mode === "edit" && isError) {
    return <p className="p-8 text-red-600">{t("dogs.loadError")}</p>;
  }

  return (
    <div className="mx-auto max-w-lg p-8">
      <h1 className="mb-6 text-2xl font-bold text-slate">
        {mode === "create" ? t("dogs.createTitle") : t("dogs.editTitle")}
      </h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldName")}</span>
          <input className={inputCls} {...register("name")} />
          {errors.name && <span className="text-xs text-red-600">{errors.name.message}</span>}
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldBreed")}</span>
          <input className={inputCls} {...register("breed")} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldSize")}</span>
          <select className={inputCls} {...register("size")} defaultValue="medium">
            <option value="small">{t("dogs.sizeSmall")}</option>
            <option value="medium">{t("dogs.sizeMedium")}</option>
            <option value="large">{t("dogs.sizeLarge")}</option>
            <option value="giant">{t("dogs.sizeGiant")}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldSex")}</span>
          <select className={inputCls} {...register("sex")} defaultValue="female">
            <option value="male">{t("dogs.sexMale")}</option>
            <option value="female">{t("dogs.sexFemale")}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldSource")}</span>
          <select className={inputCls} {...register("source")} defaultValue="rescue">
            <option value="breeder">{t("dogs.sourceBreeder")}</option>
            <option value="rescue">{t("dogs.sourceRescue")}</option>
            <option value="shelter">{t("dogs.sourceShelter")}</option>
            <option value="other">{t("dogs.sourceOther")}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldVaccineStage")}</span>
          <select className={inputCls} {...register("vaccineStage")} defaultValue="unknown">
            <option value="in_progress">{t("dogs.vaccineInProgress")}</option>
            <option value="complete">{t("dogs.vaccineComplete")}</option>
            <option value="unknown">{t("dogs.vaccineUnknown")}</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" {...register("spayedNeutered")} />
          <span className="text-sm font-medium text-slate">{t("dogs.fieldSpayedNeutered")}</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("dogs.fieldNotes")}</span>
          <textarea className={inputCls} rows={3} {...register("notes")} />
        </label>
        <div className="flex gap-2">
          <Button type="submit" disabled={isSubmitting} className="bg-slate text-cream">
            {isSubmitting ? t("dogs.saving") : t("dogs.save")}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/app")}>
            {t("dogs.cancel")}
          </Button>
        </div>
      </form>
    </div>
  );
}
