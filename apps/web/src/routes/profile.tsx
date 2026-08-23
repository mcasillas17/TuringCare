import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useValidationMessage } from "@/i18n/validation";
import { useProfile, useUpdateProfile } from "@/lib/profile";
import { zodResolver } from "@hookform/resolvers/zod";
import { type ProfileUpdateInput, profileUpdateSchema } from "@turingcare/shared";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function Profile() {
  const { t } = useI18n();
  const validationMessage = useValidationMessage();
  const { data: me, isLoading, isError } = useProfile();
  const update = useUpdateProfile();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileUpdateInput>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: { name: "" },
  });
  useEffect(() => {
    if (me) reset({ name: me.name });
  }, [me, reset]);

  if (isLoading) return <p>{t("common.loading")}</p>;
  if (isError || !me) return <p className="text-red-600">{t("profile.loadError")}</p>;

  const onSubmit = handleSubmit(async (v) => {
    try {
      await update.mutateAsync(v);
      toast.success(t("profile.saved"));
    } catch {
      toast.error(t("profile.saveFailed"));
    }
  });

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold text-slate">{t("profile.title")}</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("profile.name")}</span>
          <input className={input} {...register("name")} />
          {errors.name && (
            <span className="text-xs text-red-600">{validationMessage(errors.name.message)}</span>
          )}
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate">{t("profile.email")}</span>
          <input className={input} value={me.email} readOnly disabled />
          <span className="text-xs text-slate-soft">{t("profile.emailReadonly")}</span>
        </label>
        <Button type="submit" disabled={isSubmitting} className="bg-slate text-cream">
          {isSubmitting ? t("profile.saving") : t("profile.save")}
        </Button>
      </form>
    </div>
  );
}
