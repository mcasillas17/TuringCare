import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { resetPassword } from "@/lib/auth-client";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

export function ResetPassword() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token");
  // Keep a narrowed local copy that survives the closure inside onSubmit,
  // so we don't need a non-null assertion at the call site.
  const safeToken = token ?? "";

  const [pending, setPending] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="relative p-8 max-w-sm mx-auto">
        <LanguageToggle className="absolute right-4 top-4" />
        <Link to="/" className="mb-6 flex justify-center">
          <BrandMark />
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("auth.forgotTitle")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("auth.resetInvalidLink")}</p>
            <Link className="underline text-sm" to="/forgot-password">
              {t("auth.forgotTitle")}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwError(null);
    setConfirmError(null);
    const fd = new FormData(e.currentTarget);
    const newPassword = String(fd.get("newPassword"));
    const confirm = String(fd.get("confirmPassword"));

    if (newPassword.length < 8) {
      setPwError(t("auth.passwordTooShort"));
      return;
    }
    if (newPassword !== confirm) {
      setConfirmError(t("auth.passwordsMismatch"));
      return;
    }

    setPending(true);
    const { error } = await resetPassword({ newPassword, token: safeToken });
    setPending(false);
    if (error) {
      toast.error(t("auth.resetFailed"));
      return;
    }
    toast.success(t("auth.resetSuccess"));
    navigate("/login");
  }

  return (
    <div className="relative p-8 max-w-sm mx-auto">
      <LanguageToggle className="absolute right-4 top-4" />
      <Link to="/" className="mb-6 flex justify-center">
        <BrandMark />
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>{t("auth.resetTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1">
              <Label htmlFor="newPassword">{t("auth.newPassword")}</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                aria-invalid={pwError ? true : undefined}
                aria-describedby={pwError ? "newPassword-error" : undefined}
                required
              />
              {pwError && (
                <p id="newPassword-error" className="text-sm text-destructive">
                  {pwError}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                aria-invalid={confirmError ? true : undefined}
                aria-describedby={confirmError ? "confirmPassword-error" : undefined}
                required
              />
              {confirmError && (
                <p id="confirmPassword-error" className="text-sm text-destructive">
                  {confirmError}
                </p>
              )}
            </div>
            <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
              {pending ? t("auth.resetPending") : t("auth.resetSubmit")}
            </Button>
            <p className="text-sm text-muted-foreground">
              <Link className="underline" to="/login">
                {t("auth.backToLogin")}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
