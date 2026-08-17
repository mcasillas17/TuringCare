import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useAbandonGuidedSetup } from "@/lib/guided-setup";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function AbandonSetupButton({ setupId }: { setupId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const abandon = useAbandonGuidedSetup();
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitError(false);
    setSubmitting(true);
    try {
      const response = await abandon.mutateAsync({ setupId });
      navigate(response.setup.dogId ? `/my/dogs/${response.setup.dogId}` : "/my", {
        replace: true,
      });
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (!confirming) {
    return (
      <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
        {t("guidedSetup.exitSetup")}
      </Button>
    );
  }

  const busy = submitting || abandon.isPending;
  return (
    <div className="space-y-3 rounded border border-silver bg-white p-4">
      <p className="font-medium text-slate">{t("guidedSetup.confirmExitPrompt")}</p>
      {submitError && (
        <p role="alert" className="text-sm text-red-600">
          {t("guidedSetup.abandonError")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={handleConfirm}
          className="bg-slate text-cream"
        >
          {busy ? t("guidedSetup.saving") : t("guidedSetup.confirmExit")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => setConfirming(false)}
        >
          {t("guidedSetup.cancelExit")}
        </Button>
      </div>
    </div>
  );
}
