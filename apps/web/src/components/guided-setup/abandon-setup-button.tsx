import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { isGuidedSetupConflict, useAbandonGuidedSetup, useGuidedSetup } from "@/lib/guided-setup";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

export function AbandonSetupButton({
  setupId,
  disabled = false,
  onPendingChange,
  canNavigate,
}: {
  setupId: string;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
  canNavigate?: () => boolean;
}) {
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
  const mountedRef = useRef(true);
  const reportedPendingRef = useRef(false);

  useEffect(() => {
    if (confirming) confirmButtonRef.current?.focus();
    if (!confirming && restoreExitFocusRef.current) {
      restoreExitFocusRef.current = false;
      exitButtonRef.current?.focus();
    }
  }, [confirming]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      onPendingChange?.(false);
    };
  }, [onPendingChange]);

  const pending = submitting || abandon.isPending;
  useEffect(() => {
    if (!mountedRef.current || pending === reportedPendingRef.current) {
      return;
    }
    reportedPendingRef.current = pending;
    onPendingChange?.(pending);
  }, [onPendingChange, pending]);

  const busy = disabled || submitting || abandon.isPending;

  async function handleConfirm() {
    if (busy) return;
    setSubmitError(false);
    setSubmitting(true);
    reportedPendingRef.current = true;
    onPendingChange?.(true);
    try {
      const response = await abandon.mutateAsync({ setupId });
      if (mountedRef.current && (canNavigate?.() ?? true)) {
        navigate(response.setup.dogId ? `/my/dogs/${response.setup.dogId}` : "/my", {
          replace: true,
        });
      }
    } catch (error) {
      if (isGuidedSetupConflict(error, "setup_already_completed")) {
        try {
          const reconciled = await refetchGuidedSetup({ throwOnError: true });
          if (reconciled.isError || reconciled.error || !reconciled.data) {
            if (mountedRef.current) setSubmitError(true);
            return;
          }
          if (mountedRef.current && (canNavigate?.() ?? true)) {
            navigate(reconciled.data.active ? "/my/setup" : "/my", { replace: true });
          }
          return;
        } catch {
          if (mountedRef.current) setSubmitError(true);
          return;
        }
      }
      if (mountedRef.current) setSubmitError(true);
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
        reportedPendingRef.current = false;
        onPendingChange?.(false);
      }
    }
  }

  if (!confirming) {
    return (
      <Button
        ref={exitButtonRef}
        type="button"
        variant="outline"
        disabled={busy}
        onClick={() => {
          if (!busy) setConfirming(true);
        }}
      >
        {t("guidedSetup.exitSetup")}
      </Button>
    );
  }

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
