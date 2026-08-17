import { SetupShell } from "@/components/guided-setup/setup-shell";
import { SuggestionCard } from "@/components/training/suggestion-card";
import { useI18n } from "@/i18n";
import type { GuidedSetupRecord, TrainingSuggestion } from "@turingcare/shared";
import { Link } from "react-router-dom";

export type CompletionStepProps = {
  setup: GuidedSetupRecord;
  suggestion?: TrainingSuggestion;
  actionDeleted?: boolean;
};

function actionTypeFor(setup: GuidedSetupRecord): GuidedSetupRecord["firstActionType"] {
  if (setup.firstActionType) return setup.firstActionType;
  if (setup.intent === "understand_behavior") return "behavior";
  if (setup.intent === "track_progress") return "progress";
  if (setup.intent === "train_skill") return "training";
  return null;
}

export function CompletionStep({ setup, suggestion, actionDeleted = false }: CompletionStepProps) {
  const { t } = useI18n();
  const deleted = actionDeleted || setup.dogId === null;
  const skipped = setup.completionReason === "skipped";
  const actionType = actionTypeFor(setup);
  const destination =
    deleted || setup.dogId === null
      ? "/my"
      : skipped
        ? `/my/dogs/${setup.dogId}`
        : actionType === "training"
          ? `/my/dogs/${setup.dogId}/week`
          : actionType === "behavior" || actionType === "progress"
            ? `/my/dogs/${setup.dogId}/journal`
            : `/my/dogs/${setup.dogId}`;
  const nextStepKey =
    deleted || setup.dogId === null
      ? "guidedSetup.completionContinueDashboard"
      : skipped
        ? "guidedSetup.completionContinueDog"
        : actionType === "training"
          ? "guidedSetup.completionContinueWeek"
          : actionType === "behavior" || actionType === "progress"
            ? "guidedSetup.completionContinueJournal"
            : "guidedSetup.completionContinueDog";
  const message = deleted
    ? t("guidedSetup.completionDeleted")
    : setup.completionReason === "skipped"
      ? t("guidedSetup.completionSkipped")
      : t("guidedSetup.completionSaved");

  return (
    <SetupShell
      step={3}
      title={t("guidedSetup.completionTitle")}
      description={t(
        setup.dogId && !deleted
          ? "guidedSetup.completionDescription"
          : "guidedSetup.completionNoWorkspaceDescription",
      )}
    >
      <div className="space-y-5">
        {/* biome-ignore lint/a11y/useSemanticElements: completion announcements need an explicit status role. */}
        <div
          role="status"
          aria-live="polite"
          className="space-y-4 rounded border border-silver bg-white p-5 text-slate"
        >
          <p>{message}</p>
          <Link
            className="inline-flex rounded bg-slate px-3 py-2 text-sm text-cream"
            to={destination}
          >
            {t(nextStepKey)}
          </Link>
        </div>
        {!deleted && suggestion && <SuggestionCard mode="preview" suggestion={suggestion} />}
      </div>
    </SetupShell>
  );
}
