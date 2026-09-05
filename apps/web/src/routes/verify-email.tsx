import { BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { SessionError } from "@/components/session-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import { useSession } from "@/lib/auth-client";
import { authPagePath } from "@/lib/auth-navigation";
import { isNonemptySessionUserId } from "@/lib/session-user-id";
import { useSignOut } from "@/lib/sign-out";
import { VerificationRequestError, resendVerification } from "@/lib/verification";
import { useHasVerifiedSession } from "@/lib/verified-session";
import type { MessageKey } from "@turingcare/i18n";
import { safeAuthReturnPath } from "@turingcare/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

/** Public by design: signup and unverified sign-in do not create a session. */
export function VerifyEmail() {
  const { t, locale } = useI18n();
  const [params] = useSearchParams();
  const next = safeAuthReturnPath(params.get("next"));
  const invalidLink = params.has("error");
  const { data, isPending, isRefetching, error, refetch } = useSession();
  const hasSession = isNonemptySessionUserId(data?.user.id);
  const verified = useHasVerifiedSession();
  const signOut = useSignOut();
  const [pending, setPending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [alreadyVerified, setAlreadyVerified] = useState(false);
  const [failure, setFailure] = useState<MessageKey | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  // A query parameter is presentation only, never session/authorization evidence.
  const showContinuation =
    verified ||
    alreadyVerified ||
    (!invalidLink && !hasSession && params.get("status") === "verified");
  const success = !invalidLink && showContinuation;

  const title = success ? t("verification.successTitle") : t("verification.title");
  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | TuringCare`;
    heading.current?.focus();
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || cooldown > 0) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const input = hasSession
      ? { returnTo: next }
      : {
          email: String(fields.get("email")),
          password: String(fields.get("password")),
          returnTo: next,
        };
    // Never retain a password after a request, including failed requests.
    const password = form.elements.namedItem("password");
    if (password instanceof HTMLInputElement) password.value = "";
    setFailure(null);
    setAccepted(false);
    setPending(true);
    try {
      const status = await resendVerification(input);
      setAlreadyVerified(status === "already_verified");
      setAccepted(status === "accepted");
    } catch (cause) {
      const code = cause instanceof VerificationRequestError ? cause.code : null;
      setFailure(
        code === "invalid_credentials"
          ? "verification.invalidCredentials"
          : code === "verification_credentials_required"
            ? "verification.credentialsRequired"
            : code === "rate_limited"
              ? "verification.rateLimited"
              : "verification.sendFailed",
      );
      if (cause instanceof VerificationRequestError) setCooldown(cause.retryAfter);
    } finally {
      setPending(false);
    }
  }

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
            <h1 ref={heading} tabIndex={-1}>
              {title}
            </h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {error ? (
            <SessionError />
          ) : isPending || isRefetching ? (
            <output className="block">{t("common.loading")}</output>
          ) : (
            <>
              {invalidLink && (
                <p role="alert" className="text-sm text-destructive">
                  {t("verification.invalidLink")}
                </p>
              )}
              {showContinuation ? (
                <>
                  <p>
                    {verified ? t("verification.currentAccount") : t("verification.signInBody")}
                  </p>
                  <Button asChild className="w-full">
                    <a href={verified ? next : authPagePath("/login", next, locale)}>
                      {verified ? t("verification.continue") : t("verification.signIn")}
                    </a>
                  </Button>
                </>
              ) : (
                <>
                  <p>{t("verification.body")}</p>
                  <form onSubmit={onSubmit} className="space-y-4">
                    {!hasSession && (
                      <>
                        <p
                          id="verification-credentials-help"
                          className="text-sm text-muted-foreground"
                        >
                          {t("verification.credentialsHelp")}
                        </p>
                        <div className="space-y-1">
                          <Label htmlFor="verification-email">{t("auth.email")}</Label>
                          <Input
                            id="verification-email"
                            name="email"
                            type="email"
                            autoComplete="email"
                            maxLength={254}
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="verification-password">{t("auth.password")}</Label>
                          <Input
                            id="verification-password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            maxLength={128}
                            aria-describedby="verification-credentials-help"
                            required
                          />
                        </div>
                        <Link className="block text-sm underline" to="/forgot-password">
                          {t("auth.forgotLink")}
                        </Link>
                      </>
                    )}
                    <Button
                      className="w-full"
                      type="submit"
                      disabled={pending || cooldown > 0}
                      aria-busy={pending}
                    >
                      {pending ? t("verification.pending") : t("verification.resend")}
                    </Button>
                    {cooldown > 0 && (
                      <p className="text-sm">{t("verification.cooldown", { seconds: cooldown })}</p>
                    )}
                    {accepted && (
                      <output className="block text-sm">{t("verification.accepted")}</output>
                    )}
                  </form>
                  {hasSession ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={checking || pending}
                      aria-busy={checking}
                      onClick={async () => {
                        setChecking(true);
                        setFailure(null);
                        try {
                          await refetch({ query: { disableCookieCache: true } });
                        } catch {
                          setFailure("verification.sessionError");
                        } finally {
                          setChecking(false);
                        }
                      }}
                    >
                      {t("verification.check")}
                    </Button>
                  ) : (
                    <a
                      className="block text-sm underline"
                      href={authPagePath("/login", next, locale)}
                    >
                      {t("auth.backToLogin")}
                    </a>
                  )}
                </>
              )}
              {failure && (
                <p role="alert" className="text-sm text-destructive">
                  {t(failure)}
                </p>
              )}
              {hasSession && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={pending}
                  onClick={async () => {
                    setPending(true);
                    const result = await signOut({
                      destination: authPagePath("/login", next, locale),
                    });
                    if (!result.ok) setFailure("app.signOutFailed");
                    setPending(false);
                  }}
                >
                  {t("app.signOut")}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <Link className="block text-center text-sm underline" to="/trainers">
        {t("nav.trainers")}
      </Link>
    </main>
  );
}
