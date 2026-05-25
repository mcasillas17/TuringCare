import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { changePassword } from "@/lib/auth-client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

// Inline schema: not shared because the messages are localized via the
// `t()` call in render. The min-8 expectation mirrors register/login.
function makeSchema(t: (k: import("@/i18n/types").MessageKey) => string) {
  return z
    .object({
      currentPassword: z.string().min(8, t("settings.passwordTooShort")),
      newPassword: z.string().min(8, t("settings.passwordTooShort")),
      confirmNewPassword: z.string().min(8, t("settings.passwordTooShort")),
    })
    .refine((v) => v.newPassword === v.confirmNewPassword, {
      path: ["confirmNewPassword"],
      message: t("settings.passwordMismatch"),
    })
    .refine((v) => v.newPassword !== v.currentPassword, {
      path: ["newPassword"],
      message: t("settings.passwordSameAsCurrent"),
    });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

const inputCls = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function ChangePasswordForm() {
  const { t } = useI18n();
  const schema = makeSchema(t);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmNewPassword: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: false,
    });
    if (result?.error) {
      toast.error(t("settings.passwordChangeFailed"));
      return;
    }
    toast.success(t("settings.passwordChanged"));
    reset();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm">{t("settings.currentPassword")}</span>
        <input
          type="password"
          autoComplete="current-password"
          className={inputCls}
          aria-invalid={errors.currentPassword ? true : undefined}
          {...register("currentPassword")}
        />
        {errors.currentPassword?.message && (
          <span className="text-xs text-red-600">{errors.currentPassword.message}</span>
        )}
      </label>
      <label className="block space-y-1">
        <span className="text-sm">{t("settings.newPassword")}</span>
        <input
          type="password"
          autoComplete="new-password"
          className={inputCls}
          aria-invalid={errors.newPassword ? true : undefined}
          {...register("newPassword")}
        />
        {errors.newPassword?.message && (
          <span className="text-xs text-red-600">{errors.newPassword.message}</span>
        )}
      </label>
      <label className="block space-y-1">
        <span className="text-sm">{t("settings.confirmNewPassword")}</span>
        <input
          type="password"
          autoComplete="new-password"
          className={inputCls}
          aria-invalid={errors.confirmNewPassword ? true : undefined}
          {...register("confirmNewPassword")}
        />
        {errors.confirmNewPassword?.message && (
          <span className="text-xs text-red-600">{errors.confirmNewPassword.message}</span>
        )}
      </label>

      <Button type="submit" disabled={isSubmitting} className="bg-slate text-cream">
        {isSubmitting ? t("settings.savingPassword") : t("settings.savePassword")}
      </Button>
    </form>
  );
}
