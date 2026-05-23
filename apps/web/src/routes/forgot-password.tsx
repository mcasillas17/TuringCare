import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { requestPasswordReset } from "@/lib/auth-client";
import { useState } from "react";
import { Link } from "react-router-dom";

export function ForgotPassword() {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    setPending(true);
    // Anti-enumeration: API errors are intentionally swallowed — the success
    // view renders regardless of whether the email is registered.
    try {
      await requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // intentionally swallowed
    }
    setPending(false);
    setSent(true);
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
            <h2>{sent ? t("auth.forgotSuccessTitle") : t("auth.forgotTitle")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("auth.forgotSuccessBody")}</p>
              <Link className="underline text-sm" to="/login">
                {t("auth.backToLogin")}
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <p className="text-sm text-muted-foreground">{t("auth.forgotIntro")}</p>
              <div className="space-y-1">
                <Label htmlFor="email">{t("auth.email")}</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
                {pending ? t("auth.forgotPending") : t("auth.forgotSubmit")}
              </Button>
              <p className="text-sm text-muted-foreground">
                <Link className="underline" to="/login">
                  {t("auth.backToLogin")}
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
