import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { signIn } from "@/lib/auth-client";
import { authPagePath, isEmailUnverifiedCode } from "@/lib/auth-navigation";
import { safeAuthReturnPath } from "@turingcare/shared";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

export function Login() {
  const { t, locale } = useI18n();
  const [params] = useSearchParams();
  const next = safeAuthReturnPath(params.get("next"));
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    try {
      const { error } = await signIn.email({
        email: String(fd.get("email")),
        password: String(fd.get("password")),
      });
      if (error) {
        if (isEmailUnverifiedCode(error.code)) {
          window.location.assign(authPagePath("/verify-email", next, locale));
          return;
        }
        toast.error(t("auth.loginFailed"));
        return;
      }
      // Own the only navigation: Better Auth auto-redirects if given callbackURL.
      // A document load also reinitializes its deferred session atom.
      window.location.assign(next);
    } catch {
      toast.error(t("auth.loginFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="relative p-8 max-w-sm mx-auto">
      <LanguageToggle className="absolute right-4 top-4" />
      <Link to="/" className="mb-6 flex justify-center">
        <BrandMark />
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>{t("auth.loginTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <div className="text-right -mt-2">
              <Link className="underline text-sm text-muted-foreground" to="/forgot-password">
                {t("auth.forgotLink")}
              </Link>
            </div>
            <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
              {pending ? t("auth.loginPending") : t("auth.loginSubmit")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("auth.noAccount")}{" "}
              <Link className="underline" to={authPagePath("/register", next, locale)}>
                {t("auth.registerLink")}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
