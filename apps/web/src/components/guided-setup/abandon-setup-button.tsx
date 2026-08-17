import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { isGuidedSetupConflict, useAbandonGuidedSetup, useGuidedSetup } from "@/lib/guided-setup";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export function AbandonSetupButton({ setupId }: { setupId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const abandon = useAbandonGuidedSetup();
  const { refetch: refetchGuidedSetup } = useGuidedSetup();
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const exitButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const restoreExitFocusRef = useRef(false);

  useEffect(() => {
    if (confirming) confirmButtonRef.current?.focus();
    if (!confirming && restoreExitFocusRef.current) {
      restoreExitFocusRef.current = false;
      exitButtonRef.current?.focus();
    }
  }, [confirming]);

  async function handleConfirm() {
    setSubmitError(false);
    setSubmitting(true);
    try {
      const response = await abandon.mutateAsync({ setupId });
      navigate(response.setup.dogId ? `/my/dogs/${response.setup.dogId}` : "/my", {
        replace: true,
      });
    } catch (error) {
      if (isGuidedSetupConflict(error, "setup_already_completed")) {
        try {
          const reconciled = await refetchGuidedSetup();
          if (reconciled.data) {
            navigate(reconciled.data.active ? "/my/setup" : "/my", { replace: true });
            return;
          }
          setSubmitError(true);
        } catch {
          setSubmitError(true);
        }
      }
      if (!isGuidedSetupConflict(error, "setup_already_completed")) setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (!confirming) {
    return (
      <Button
        ref={exitButtonRef}
        type="button"
        variant="outline"
        onClick={() => setConfirming(true)}
      >
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
          ref={confirmButtonRef}
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
          onClick={() => {
            restoreExitFocusRef.current = true;
            setConfirming(false);
          }}
        >
          {t("guidedSetup.cancelExit")}
        </Button>
      </div>
    </div>
  );
}
