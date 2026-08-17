import { BehaviorActionStep } from "@/components/guided-setup/behavior-action-step";
import { CompletionStep } from "@/components/guided-setup/completion-step";
import { DogBasicsStep } from "@/components/guided-setup/dog-basics-step";
import { IntentStep } from "@/components/guided-setup/intent-step";
import { ProgressActionStep } from "@/components/guided-setup/progress-action-step";
import { TrainingActionStep } from "@/components/guided-setup/training-action-step";
import { useI18n } from "@/i18n";
import {
  type GuidedBehaviorActionResponse,
  type GuidedProgressActionResponse,
  type GuidedSetupErrorMessageKey,
  type GuidedSkipResponse,
  type GuidedTrainingActionResponse,
  guidedSetupErrorMessageKey,
  isGuidedSetupReconciliationConflict,
  useGuidedSetup,
  useSkipGuidedSetup,
} from "@/lib/guided-setup";
import type { GuidedSetupRecord, GuidedSetupStatus, TrainingSuggestion } from "@turingcare/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";

type CompletionState =
  | {
      kind: "saved";
      setup: GuidedSetupRecord;
      actionDeleted: false;
      suggestion?: TrainingSuggestion;
    }
  | { kind: "skipped"; setup: GuidedSetupRecord; actionDeleted: false }
  | { kind: "deleted"; setup: GuidedSetupRecord; actionDeleted: true; suggestion: null };

export function GuidedSetup({ allowNewDog = false }: { allowNewDog?: boolean }) {
  const { t } = useI18n();
  const setupQuery = useGuidedSetup();
  const lastKnownStatus = useRef<GuidedSetupStatus | undefined>(undefined);
  const skipLock = useRef(false);
  const completionRef = useRef<CompletionState | null>(null);
  const [startedSetup, setStartedSetup] = useState<GuidedSetupRecord | null>(null);
  const [hasStartedSetup, setHasStartedSetup] = useState(false);
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const [skipError, setSkipError] = useState<GuidedSetupErrorMessageKey | null>(null);
  const [skipSubmitting, setSkipSubmitting] = useState(false);
  const [abandonPending, setAbandonPending] = useState(false);
  const abandonPendingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const onAbandonPendingChange = useCallback((pending: boolean) => {
    if (!mountedRef.current) return;
    abandonPendingRef.current = pending;
    setAbandonPending(pending);
  }, []);
  const canNavigateAfterAbandon = useCallback(() => completionRef.current === null, []);
  const skip = useSkipGuidedSetup({
    onCompleted: (response: GuidedSkipResponse) => {
      const nextCompletion: CompletionState = {
        kind: "skipped",
        setup: response.setup,
        actionDeleted: false,
      };
      completionRef.current = nextCompletion;
      setCompletion(nextCompletion);
    },
  });

  if (setupQuery.data !== undefined) {
    lastKnownStatus.current = setupQuery.data;
  }
  const usableStatus = setupQuery.data ?? lastKnownStatus.current;
  const statusUnavailable = setupQuery.isError || setupQuery.data === undefined;

  const visibleCompletion = completion ?? completionRef.current;
  if (visibleCompletion) {
    return (
      <CompletionStep
        setup={visibleCompletion.setup}
        suggestion={
          "suggestion" in visibleCompletion
            ? (visibleCompletion.suggestion ?? undefined)
            : undefined
        }
        actionDeleted={visibleCompletion.actionDeleted}
      />
    );
  }

  if (setupQuery.isLoading && !usableStatus) {
    return <p>{t("common.loading")}</p>;
  }

  if (!usableStatus) {
    return (
      <section
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded border border-copper bg-cream p-4"
      >
        <p className="text-sm text-slate">{t("guidedSetup.loadError")}</p>
        <button
          type="button"
          onClick={() => void setupQuery.refetch()}
          disabled={setupQuery.isFetching}
          className="rounded bg-slate px-3 py-1 text-sm text-cream disabled:opacity-60"
        >
          {t("guidedSetup.retry")}
        </button>
      </section>
    );
  }

  const active = hasStartedSetup ? startedSetup : usableStatus.active;
  if (!active) {
    if (!allowNewDog && (!usableStatus.autoStartEligible || hasStartedSetup)) {
      return <Navigate to="/my" replace />;
    }
  }

  const step = active ? (active.currentStep === "intent" ? 2 : 3) : 1;
  const onStarted = (setup: GuidedSetupRecord | null) => {
    setSkipError(null);
    setStartedSetup(setup);
    setHasStartedSetup(true);
  };
  const reconcileSetup = async () => {
    try {
      const reconciled = await setupQuery.refetch({ throwOnError: true });
      if (reconciled.isError || reconciled.error || !reconciled.data) return false;
      onStarted(reconciled.data.active);
      return true;
    } catch {
      return false;
    }
  };
  const onBack = () => {
    if (abandonPendingRef.current) return;
    setSkipError(null);
    if (active) {
      setStartedSetup({ ...active, currentStep: "intent" });
      setHasStartedSetup(true);
    }
  };
  const onSkip = async () => {
    if (abandonPendingRef.current || skipLock.current || !active) return;
    skipLock.current = true;
    setSkipSubmitting(true);
    setSkipError(null);
    try {
      await skip.mutateAsync({ setupId: active.id });
    } catch (error) {
      if (isGuidedSetupReconciliationConflict(error)) {
        const reconciled = await reconcileSetup();
        if (reconciled) return;
      }
      setSkipError(guidedSetupErrorMessageKey(error));
    } finally {
      skipLock.current = false;
      setSkipSubmitting(false);
    }
  };
  const onBehaviorCompleted = (response: GuidedBehaviorActionResponse) => {
    const nextCompletion: CompletionState = response.actionDeleted
      ? { kind: "deleted", setup: response.setup, actionDeleted: true, suggestion: null }
      : { kind: "saved", setup: response.setup, actionDeleted: false };
    completionRef.current = nextCompletion;
    setCompletion(nextCompletion);
  };
  const onProgressCompleted = (response: GuidedProgressActionResponse) => {
    const nextCompletion: CompletionState = response.actionDeleted
      ? { kind: "deleted", setup: response.setup, actionDeleted: true, suggestion: null }
      : { kind: "saved", setup: response.setup, actionDeleted: false };
    completionRef.current = nextCompletion;
    setCompletion(nextCompletion);
  };
  const onTrainingCompleted = (response: GuidedTrainingActionResponse) => {
    const nextCompletion: CompletionState = response.actionDeleted
      ? { kind: "deleted", setup: response.setup, actionDeleted: true, suggestion: null }
      : {
          kind: "saved",
          setup: response.setup,
          actionDeleted: false,
          suggestion: response.suggestion,
        };
    completionRef.current = nextCompletion;
    setCompletion(nextCompletion);
  };

  return (
    <>
      <output aria-live="polite" className="sr-only">
        {t("guidedSetup.stepAnnouncement", { step })}
      </output>
      {statusUnavailable && (
        <section
          role="alert"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded border border-copper bg-cream p-4"
        >
          <p className="text-sm text-slate">{t("guidedSetup.overviewWarning")}</p>
          <button
            type="button"
            onClick={() => void setupQuery.refetch()}
            disabled={setupQuery.isFetching}
            className="rounded bg-slate px-3 py-1 text-sm text-cream disabled:opacity-60"
          >
            {t("guidedSetup.retry")}
          </button>
        </section>
      )}
      {!active ? (
        <DogBasicsStep onStarted={onStarted} />
      ) : active.currentStep === "intent" ? (
        <IntentStep
          key={active.id}
          setup={active}
          onSaved={onStarted}
          onReconcile={reconcileSetup}
          abandonPending={abandonPending}
          onAbandonPendingChange={onAbandonPendingChange}
          canNavigateAfterAbandon={canNavigateAfterAbandon}
        />
      ) : active.intent === "understand_behavior" ? (
        <BehaviorActionStep
          key={active.id}
          setup={active}
          onCompleted={onBehaviorCompleted}
          onReconcile={reconcileSetup}
          onBack={onBack}
          onSkip={() => void onSkip()}
          skipPending={skipSubmitting || skip.isPending}
          skipError={skipError}
          abandonPending={abandonPending}
          onAbandonPendingChange={onAbandonPendingChange}
          canNavigateAfterAbandon={canNavigateAfterAbandon}
        />
      ) : active.intent === "track_progress" ? (
        <ProgressActionStep
          key={active.id}
          setup={active}
          onCompleted={onProgressCompleted}
          onReconcile={reconcileSetup}
          onBack={onBack}
          onSkip={() => void onSkip()}
          skipPending={skipSubmitting || skip.isPending}
          skipError={skipError}
          abandonPending={abandonPending}
          onAbandonPendingChange={onAbandonPendingChange}
          canNavigateAfterAbandon={canNavigateAfterAbandon}
        />
      ) : (
        <TrainingActionStep
          key={active.id}
          setup={active}
          onCompleted={onTrainingCompleted}
          onReconcile={reconcileSetup}
          onBack={onBack}
          onSkip={() => void onSkip()}
          skipPending={skipSubmitting || skip.isPending}
          skipError={skipError}
          abandonPending={abandonPending}
          onAbandonPendingChange={onAbandonPendingChange}
          canNavigateAfterAbandon={canNavigateAfterAbandon}
        />
      )}
    </>
  );
}
