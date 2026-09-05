import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { signUp } from "@/lib/auth-client";
import { authPagePath, verificationCallbackUrl } from "@/lib/auth-navigation";
import { safeAuthReturnPath } from "@turingcare/shared";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

export function Register() {
  const { t, locale } = useI18n();
  const [params] = useSearchParams();
  const next = safeAuthReturnPath(params.get("next"));
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    try {
      const { error } = await signUp.email({
        name: String(fd.get("name")),
        email: String(fd.get("email")),
        password: String(fd.get("password")),
        callbackURL: verificationCallbackUrl(next, locale),
      });
      if (error) return toast.error(t("auth.registerFailed"));
      // Signup can be accepted without a session or confirmed inbox delivery.
      window.location.assign(authPagePath("/verify-email", next, locale));
    } catch {
      toast.error(t("auth.registerFailed"));
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
          <CardTitle>{t("auth.registerTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">{t("auth.name")}</Label>
              <Input id="name" name="name" type="text" autoComplete="name" required />
            </div>
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
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <Button type="submit" disabled={pending} aria-busy={pending} className="w-full">
              {pending ? t("auth.registerPending") : t("auth.registerSubmit")}
            </Button>
            <p className="text-xs text-slate-soft">
              {t("register.agreementPrefix")}{" "}
              <Link className="underline" to="/terms">
                {t("footer.terms")}
              </Link>
              {t("register.agreementJoin")}
              <Link className="underline" to="/privacy">
                {t("footer.privacy")}
              </Link>
              .
            </p>
            <p className="text-sm text-muted-foreground">
              {t("auth.haveAccount")}{" "}
              <Link className="underline" to={authPagePath("/login", next, locale)}>
                {t("auth.loginLink")}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
