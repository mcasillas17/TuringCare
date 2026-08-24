import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { deleteUser } from "@/lib/auth-client";
import { type AccountDeletionReadiness, getAccountDeletionReadiness } from "@/lib/profile";
import { useSignOut } from "@/lib/sign-out";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

const inputCls = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function DeleteAccountButton() {
  const { t } = useI18n();
  const signOutAndNavigate = useSignOut();
  const [expanded, setExpanded] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletionBlock, setDeletionBlock] = useState<Exclude<
    AccountDeletionReadiness,
    { status: "ready" }
  > | null>(null);

  const confirmWord = t("settings.deleteConfirmWord");

  function collapse() {
    setExpanded(false);
    setConfirmText("");
    setDeletionBlock(null);
  }

  async function recoverDeletionBlock() {
    try {
      const readiness = await getAccountDeletionReadiness();
      if (readiness.status !== "ready") {
        setDeletionBlock(readiness);
        return true;
      }
    } catch {
      // The original deletion failure remains authoritative when the recovery
      // read is also unavailable.
    }
    return false;
  }

  async function onConfirm() {
    setSubmitting(true);
    setDeletionBlock(null);
    try {
      const readiness = await getAccountDeletionReadiness();
      if (readiness.status !== "ready") {
        setDeletionBlock(readiness);
        setSubmitting(false);
        return;
      }
    } catch {
      setSubmitting(false);
      toast.error(t("settings.deleteFailed"));
      return;
    }
    let result: Awaited<ReturnType<typeof deleteUser>>;
    try {
      result = await deleteUser({});
    } catch {
      setSubmitting(false);
      if (await recoverDeletionBlock()) return;
      toast.error(t("settings.deleteFailed"));
      return;
    }
    if (result?.error) {
      setSubmitting(false);
      if (await recoverDeletionBlock()) return;
      toast.error(t("settings.deleteFailed"));
      return;
    }
    await signOutAndNavigate({ destination: "/", navigateOnFailure: true });
    setSubmitting(false);
    toast.success(t("settings.accountDeleted"));
  }

  if (!expanded) {
    return (
      <Button
        type="button"
        variant="outline"
        className="text-red-700 hover:text-red-700"
        onClick={() => setExpanded(true)}
      >
        {t("settings.deleteAccount")}
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded border border-red-200 bg-red-50 p-3">
      {deletionBlock && (
        <div role="alert" className="space-y-2 rounded border border-copper bg-cream p-3 text-sm">
          <p>
            {deletionBlock.status === "brief_delivery_in_progress"
              ? t("settings.accountDeletionDeliveryInProgress")
              : t("settings.accountDeletionDeliveryRecovery")}
          </p>
          <Link className="font-medium underline" to={`/my/dogs/${deletionBlock.dogId}/brief`}>
            {t("dogs.resolveBriefDelivery")}
          </Link>
        </div>
      )}
      <label className="block space-y-1">
        <span className="text-sm text-slate">{t("settings.deleteConfirmHint")}</span>
        <input
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className={inputCls}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
        />
      </label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="destructive"
          disabled={submitting || confirmText !== confirmWord}
          onClick={onConfirm}
        >
          {submitting ? t("settings.deleting") : t("settings.deleteConfirmCta")}
        </Button>
        <Button type="button" variant="outline" onClick={collapse} disabled={submitting}>
          {t("settings.cancel")}
        </Button>
      </div>
    </div>
  );
}
