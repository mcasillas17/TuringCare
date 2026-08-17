import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { deleteUser } from "@/lib/auth-client";
import { useSignOut } from "@/lib/sign-out";
import { useState } from "react";
import { toast } from "sonner";

const inputCls = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function DeleteAccountButton() {
  const { t } = useI18n();
  const signOutAndNavigate = useSignOut();
  const [expanded, setExpanded] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const confirmWord = t("settings.deleteConfirmWord");

  function collapse() {
    setExpanded(false);
    setConfirmText("");
  }

  async function onConfirm() {
    setSubmitting(true);
    const result = await deleteUser({});
    if (result?.error) {
      setSubmitting(false);
      toast.error(t("settings.deleteFailed"));
      return;
    }
    await signOutAndNavigate("/");
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
