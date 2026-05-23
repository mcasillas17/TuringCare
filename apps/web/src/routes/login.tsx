import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { signIn } from "@/lib/auth-client";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export function Login() {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setPending(true);
    const { error } = await signIn.email({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setPending(false);
    if (error) return toast.error(error.message ?? t("auth.loginFailed"));
    // Full-load navigation (not react-router navigate): Better Auth refreshes the
    // useSession atom on a deferred timer after sign-in, so an in-app navigate to
    // the RequireAuth-gated /my would read a stale null session and bounce back to
    // /login. A document load re-initializes the session from the now-set cookie.
    window.location.assign("/my");
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
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            <div className="text-right -mt-2">
              <Link className="underline text-sm text-muted-foreground" to="/forgot-password">
                {t("auth.forgotLink")}
              </Link>
            </div>
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? t("auth.loginPending") : t("auth.loginSubmit")}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t("auth.noAccount")}{" "}
              <Link className="underline" to="/register">
                {t("auth.registerLink")}
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
