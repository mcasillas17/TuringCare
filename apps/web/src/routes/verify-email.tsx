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
import {
  VerificationRequestError,
  confirmVerification,
  resendVerification,
  useVerificationStatus,
  verificationStatusKey,
} from "@/lib/verification";
import { useHasVerifiedSession } from "@/lib/verified-session";
import { useQueryClient } from "@tanstack/react-query";
import type { MessageKey } from "@turingcare/i18n";
import { safeAuthReturnPath } from "@turingcare/shared";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

/** The public route never needs an authenticated layout or persisted credentials. */
export function VerifyEmail() {
  const { data } = useSession();
  const userId = isNonemptySessionUserId(data?.user.id) ? data.user.id : null;
  return <VerificationRecovery key={userId ?? "anonymous"} />;
}

function VerificationRecovery() {
  const { t, locale } = useI18n();
  const [params] = useSearchParams();
  const { data, isPending, error, refetch } = useSession();
  const hasSession = isNonemptySessionUserId(data?.user.id);
  const currentAccountVerified = useHasVerifiedSession();
  const proof = useVerificationStatus();
  const [requestingNewLink, setRequestingNewLink] = useState(false);
  const receipt = proof.isError ? undefined : proof.data;
  const next = safeAuthReturnPath(
    receipt && receipt.status !== "none" && !requestingNewLink ? receipt.next : params.get("next"),
  );
  // A query can only suppress success, never establish ownership.
  const invalidLink =
    Boolean(receipt) &&
    (params.has("error") || receipt?.status === "invalid" || receipt?.status === "expired");
  const requiresSignOut = !requestingNewLink && !invalidLink && receipt?.requiresSignOut === true;
  const linkPending = !requestingNewLink && !invalidLink && receipt?.status === "pending";
  const linkVerified = !requestingNewLink && !invalidLink && receipt?.status === "verified";
  const queryClient = useQueryClient();
  const signOut = useSignOut();
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [checking, setChecking] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [alreadyVerified, setAlreadyVerified] = useState(false);
  const [failure, setFailure] = useState<MessageKey | null>(null);
  const [confirmFailed, setConfirmFailed] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [cooldownFinished, setCooldownFinished] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const busy = sending || confirming || checking || signingOut;
  const showResend = !linkPending && !linkVerified && !currentAccountVerified && !alreadyVerified;
  const showSignIn = !requiresSignOut && !hasSession && (linkVerified || alreadyVerified);
  const title = requiresSignOut
    ? t("verification.switchTitle")
    : linkVerified
      ? t("verification.successTitle")
      : currentAccountVerified && !linkPending && !invalidLink
        ? t("verification.currentAccountTitle")
        : alreadyVerified && !invalidLink
          ? t("verification.signIn")
          : t("verification.title");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${title} | TuringCare`;
    heading.current?.focus();
    return () => {
      document.title = previousTitle;
    };
  }, [title]);

  useEffect(() => {
    if (cooldownUntil === null) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
      setCooldown(remaining);
      if (remaining === 0) {
        setCooldownUntil(null);
        setCooldownFinished(true);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);

  function beginCooldown(seconds: number) {
    setCooldown(seconds);
    setCooldownUntil(seconds > 0 ? Date.now() + seconds * 1000 : null);
    setCooldownFinished(false);
  }

  async function checkSession() {
    setChecking(true);
    setFailure(null);
    try {
      await refetch({ query: { disableCookieCache: true } });
    } catch {
      setFailure("verification.sessionError");
    } finally {
      setChecking(false);
    }
  }

  async function confirm() {
    if (busy || requiresSignOut) return;
    setConfirming(true);
    setConfirmFailed(false);
    try {
      const result = await confirmVerification();
      queryClient.setQueryData(verificationStatusKey, result);
      // Refresh a legacy cookie only; confirmation never signs in or switches accounts.
      if (result.status === "verified" && hasSession && !result.requiresSignOut)
        await checkSession();
    } catch {
      setConfirmFailed(true);
    } finally {
      setConfirming(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || cooldown > 0 || error || isPending || !receipt) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const input = hasSession
      ? { returnTo: next }
      : {
          email: String(fields.get("email")),
          password: String(fields.get("password")),
          returnTo: next,
        };
    const password = form.elements.namedItem("password");
    if (password instanceof HTMLInputElement) password.value = "";
    setFailure(null);
    setAccepted(false);
    setSending(true);
    try {
      const result = await resendVerification(input);
      setAlreadyVerified(result.status === "already_verified");
      setAccepted(result.status === "accepted");
      if (result.status === "accepted") beginCooldown(result.retryAfter);
      else if (hasSession) await checkSession();
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
      if (cause instanceof VerificationRequestError) beginCooldown(cause.retryAfter);
    } finally {
      setSending(false);
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
            <h1 ref={heading} tabIndex={-1} className="outline-none">
              {title}
            </h1>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && <SessionError />}
          {proof.isPending && <p>{t("verification.checkingLink")}</p>}
          {proof.isError && (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">
                {t("verification.statusFailed")}
              </p>
              <Button disabled={proof.isFetching} onClick={() => void proof.refetch()}>
                {t("verification.retry")}
              </Button>
            </div>
          )}
          {invalidLink && (
            <p role="alert" className="text-sm text-destructive">
              {t("verification.invalidLink")}
            </p>
          )}
          {requiresSignOut && (
            <p>
              {linkPending ? t("verification.switchPending") : t("verification.switchVerified")}
            </p>
          )}
          {linkPending && !requiresSignOut && (
            <div className="space-y-3">
              <p>{t("verification.confirmBody")}</p>
              <Button
                className="w-full"
                disabled={busy}
                aria-busy={confirming}
                onClick={() => void confirm()}
              >
                {confirming
                  ? t("verification.confirmPending")
                  : confirmFailed
                    ? t("verification.retry")
                    : t("verification.confirm")}
              </Button>
              {confirmFailed && (
                <p role="alert" className="text-sm text-destructive">
                  {t("verification.confirmFailed")}
                </p>
              )}
            </div>
          )}
          {currentAccountVerified && (
            <div className="space-y-3">
              <p>{t("verification.currentAccount")}</p>
              <Button asChild className="w-full">
                <a href={next}>{t("verification.continue")}</a>
              </Button>
            </div>
          )}
          {showSignIn && (
            <div className="space-y-3">
              <p>{t("verification.signInBody")}</p>
              <Button asChild className="w-full">
                <a href={authPagePath("/login", next, locale)}>{t("verification.signIn")}</a>
              </Button>
            </div>
          )}
          {(linkVerified || alreadyVerified) &&
            hasSession &&
            !currentAccountVerified &&
            !requiresSignOut && <p>{t("verification.sessionNotVerified")}</p>}
          {showResend && (
            <>
              <p>{t("verification.body")}</p>
              <form onSubmit={onSubmit} className="space-y-4">
                {!hasSession && (
                  <>
                    <p id="verification-credentials-help" className="text-sm text-muted-foreground">
                      {t("verification.credentialsHelp")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("verification.signupRecovery")}
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
                  </>
                )}
                <Button
                  className="w-full"
                  type="submit"
                  disabled={busy || isPending || Boolean(error) || !receipt || cooldown > 0}
                  aria-busy={sending}
                >
                  {sending ? t("verification.pending") : t("verification.resend")}
                </Button>
                {failure && (
                  <p role="alert" className="text-sm text-destructive">
                    {t(failure)}
                  </p>
                )}
                {cooldown > 0 && (
                  <p className="text-sm">{t("verification.cooldown", { seconds: cooldown })}</p>
                )}
                <output className="block text-sm" aria-live="polite" aria-atomic="true">
                  {accepted && t("verification.accepted")}{" "}
                  {cooldown > 0
                    ? t("verification.cooldownStarted")
                    : cooldownFinished
                      ? t("verification.cooldownFinished")
                      : ""}
                </output>
                {!hasSession && (
                  <div className="space-y-3">
                    <Link className="block text-sm underline" to="/forgot-password">
                      {t("auth.forgotLink")}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {t("verification.typoRecovery")}
                    </p>
                    <Link
                      className="block text-sm underline"
                      to={authPagePath("/register", next, locale)}
                    >
                      {t("verification.registerCorrectEmail")}
                    </Link>
                  </div>
                )}
              </form>
              {!hasSession && (
                <a className="block text-sm underline" href={authPagePath("/login", next, locale)}>
                  {t("auth.backToLogin")}
                </a>
              )}
            </>
          )}
          {!showResend && failure && (
            <p role="alert" className="text-sm text-destructive">
              {t(failure)}
            </p>
          )}
          {(linkPending || linkVerified || alreadyVerified) && !currentAccountVerified && (
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setRequestingNewLink(true);
                setAlreadyVerified(false);
                setAccepted(false);
                setFailure(null);
              }}
            >
              {t("verification.otherLink")}
            </Button>
          )}
          {hasSession && !currentAccountVerified && !requiresSignOut && (
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              aria-busy={checking}
              onClick={() => void checkSession()}
            >
              {t("verification.check")}
            </Button>
          )}
          {(hasSession || requiresSignOut) && (
            <Button
              variant="outline"
              className="w-full"
              disabled={busy}
              onClick={async () => {
                setSigningOut(true);
                const result = await signOut({
                  destination: authPagePath(
                    requiresSignOut && linkPending ? "/verify-email" : "/login",
                    next,
                    locale,
                  ),
                });
                if (!result.ok) setFailure("app.signOutFailed");
                setSigningOut(false);
              }}
            >
              {t("app.signOut")}
            </Button>
          )}
        </CardContent>
      </Card>
      <Link className="block text-center text-sm underline" to="/trainers">
        {t("nav.trainers")}
      </Link>
    </main>
  );
}
