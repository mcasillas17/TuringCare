import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n";
import { authPagePath } from "@/lib/auth-navigation";
import { useSignOut } from "@/lib/sign-out";
import { safeAuthReturnPath } from "@turingcare/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

/** Failure-only navigation state; no old receipt is queried or treated as proof. */
export function VerificationNavigationRecovery({ hasSession }: { hasSession: boolean }) {
  const { t, locale } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const next = safeAuthReturnPath(params.get("next"));
  const retryAfter = Number(params.get("retryAfter"));
  const initialDelay =
    Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 60 ? retryAfter : 0;
  const [deadline] = useState(() => Date.now() + initialDelay * 1000);
  const [remaining, setRemaining] = useState(initialDelay);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutFailed, setSignOutFailed] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${t("verification.title")} | TuringCare`;
    heading.current?.focus();
    return () => {
      document.title = previousTitle;
    };
  }, [t]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  return (
    <main className="relative mx-auto w-full max-w-md space-y-6 px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link to="/">
          <BrandMark />
        </Link>
        <LanguageToggle />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            <h1 ref={heading} tabIndex={-1} className="outline-none">
              {t("verification.title")}
            </h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p role="alert">{t("verification.rateLimited")}</p>
          <p>{t("verification.reopenLimitedLink")}</p>
          {remaining > 0 && <p>{t("verification.cooldown", { seconds: remaining })}</p>}
          <output className="block text-sm" aria-live="polite" aria-atomic="true">
            {remaining > 0 ? t("verification.cooldownStarted") : t("verification.cooldownFinished")}
          </output>
          <Button
            className="w-full"
            disabled={remaining > 0 || signingOut}
            onClick={() => navigate(authPagePath("/verify-email", next, locale), { replace: true })}
          >
            {t("verification.navigationRecovery")}
          </Button>
          {hasSession && (
            <Button
              variant="outline"
              className="w-full"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                const result = await signOut({ destination: authPagePath("/login", next, locale) });
                setSignOutFailed(!result.ok);
                setSigningOut(false);
              }}
            >
              {t("app.signOut")}
            </Button>
          )}
          {signOutFailed && <p role="alert">{t("app.signOutFailed")}</p>}
          <Link className="block text-sm underline" to={authPagePath("/login", next, locale)}>
            {t("auth.backToLogin")}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
