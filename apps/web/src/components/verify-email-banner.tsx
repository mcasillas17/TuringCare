import { useI18n } from "@/i18n";
import { sendVerificationEmail, useSession } from "@/lib/auth-client";
import { isNonemptySessionUserId } from "@/lib/session-user-id";
import { useState } from "react";
import { toast } from "sonner";

export function VerifyEmailBanner() {
  const { t } = useI18n();
  const { data } = useSession();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const isAuthenticated = isNonemptySessionUserId(data?.user?.id);

  const emailVerified = isAuthenticated
    ? (data.user as { emailVerified?: boolean }).emailVerified
    : undefined;

  if (!isAuthenticated || emailVerified === true || dismissed) {
    return null;
  }

  async function handleResend() {
    if (!isAuthenticated || !data) return;
    setSending(true);
    try {
      const result = await sendVerificationEmail({
        email: data.user.email,
        callbackURL: `${window.location.origin}/my`,
      });
      if (result.error) {
        toast.error(t("verifyBanner.resendError"));
      } else {
        toast.success(t("verifyBanner.resendSuccess"));
      }
    } catch {
      toast.error(t("verifyBanner.resendError"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 bg-amber-50 px-4 py-2 text-sm text-amber-900 border-b border-amber-200"
    >
      <span>{t("verifyBanner.message")}</span>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={sending}
          onClick={handleResend}
          className="rounded px-3 py-1 text-xs font-medium bg-amber-200 hover:bg-amber-300 disabled:opacity-50"
        >
          {t("verifyBanner.resend")}
        </button>
        <button
          type="button"
          aria-label={t("verifyBanner.dismiss")}
          onClick={() => setDismissed(true)}
          className="rounded p-1 hover:bg-amber-200"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}
