import {
  ContextLabels,
  ContextStatusBadge,
  contextActionDirection,
  contextActionReason,
} from "@/components/progress/contextual-progress-presentation";
import { SafetyNotice } from "@/components/training/safety-notice";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useRecordContextualProgressEvent } from "@/lib/contextual-progress";
import type { FocusSkill } from "@/lib/weekly-focus";
import { CONTEXTUAL_PROGRESS_WINDOW_DAYS } from "@turingcare/shared";
import type { ExactContextEvidence, NextPracticeAction } from "@turingcare/shared";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

function StrongestContextCompact({
  evidence,
  t,
}: {
  evidence: ExactContextEvidence | null;
  t: ReturnType<typeof useI18n>["t"];
}) {
  if (!evidence) {
    return <p className="text-sm text-slate-soft">{t("contextProgress.empty")}</p>;
  }

  return (
    <div className="space-y-2 rounded border border-silver bg-cream p-3">
      <ContextStatusBadge status={evidence.status} t={t} className="inline-flex" />
      {evidence.status === "developing" && evidence.latestOutcome === "too_hard" && (
        <p className="text-sm text-slate-soft">{t("contextProgress.needsSupport")}</p>
      )}
      {evidence.status === "not_observed" ? (
        <p className="text-sm text-slate-soft">{t("contextProgress.noEvidence")}</p>
      ) : (
        <p className="text-sm text-slate-soft">
          {t(
            evidence.successfulDistinctDays === 1
              ? "contextProgress.successfulDay"
              : "contextProgress.successfulDays",
            { days: evidence.successfulDistinctDays },
          )}
        </p>
      )}
      <ContextLabels context={evidence.context} t={t} compact />
    </div>
  );
}

function NextActionCompact({
  action,
  t,
}: {
  action: NextPracticeAction | null;
  t: ReturnType<typeof useI18n>["t"];
}) {
  if (!action) return null;

  return (
    <div className="space-y-2 rounded border border-silver bg-white p-3">
      <p className="text-sm font-medium text-slate">
        {contextActionDirection(action.direction, t)}
      </p>
      <p className="text-sm text-slate-soft">{contextActionReason(action, t)}</p>
      <ContextLabels context={action.context} t={t} compact />
    </div>
  );
}

export function ContextualProgressSummaryCard({
  dogId,
  skill,
  onRetry,
  showSafetyNotice = true,
  suppressActions = false,
}: {
  dogId: string;
  skill: Pick<FocusSkill, "skillId" | "name" | "contextualProgress">;
  onRetry: () => unknown;
  showSafetyNotice?: boolean;
  suppressActions?: boolean;
}) {
  const { t } = useI18n();
  const recordEvent = useRecordContextualProgressEvent(dogId);
  const viewRecorded = useRef(false);
  const progress = skill.contextualProgress;
  const summary = progress.status === "ready" ? progress.summary : null;
  const availableNextPracticeAction =
    suppressActions || summary?.safety ? null : (summary?.nextPracticeAction ?? null);
  const detailHref = `/my/dogs/${dogId}/training#skill-${skill.skillId}`;

  useEffect(() => {
    if (progress.status !== "ready" || viewRecorded.current) return;
    viewRecorded.current = true;
    recordEvent.mutate({
      name: "training.context_insight_viewed",
      surface: "week",
      strongestStatus: progress.summary.strongestContext?.status ?? null,
      hasNextAction: Boolean(availableNextPracticeAction),
    });
  }, [availableNextPracticeAction, progress, recordEvent]);

  return (
    <section
      aria-labelledby={`week-context-${skill.skillId}`}
      className="space-y-2 rounded border border-silver bg-white p-3"
    >
      <div>
        <h2 id={`week-context-${skill.skillId}`} className="font-medium text-slate">
          {skill.name}
        </h2>
        <p className="text-sm text-slate-soft">
          {t("contextProgress.recentWindow", { days: CONTEXTUAL_PROGRESS_WINDOW_DAYS })}
        </p>
      </div>

      {progress.status === "unavailable" ? (
        <div className="space-y-2">
          <output className="block text-sm text-slate-soft">
            {t("contextProgress.loadError")}
          </output>
          <Button type="button" variant="outline" onClick={() => void onRetry()}>
            {t("contextProgress.retry")}
          </Button>
        </div>
      ) : (
        <>
          {showSafetyNotice && summary?.safety && (
            <SafetyNotice safety={summary.safety} headingLevel="h3" />
          )}
          <section aria-labelledby={`week-context-${skill.skillId}-strongest`}>
            <h3
              id={`week-context-${skill.skillId}-strongest`}
              className="text-sm font-medium text-slate"
            >
              {t("contextProgress.strongest")}
            </h3>
            <StrongestContextCompact evidence={summary?.strongestContext ?? null} t={t} />
          </section>
          {availableNextPracticeAction && (
            <section aria-labelledby={`week-context-${skill.skillId}-next`}>
              <h3
                id={`week-context-${skill.skillId}-next`}
                className="text-sm font-medium text-slate"
              >
                {t("contextProgress.practiceNext")}
              </h3>
              <NextActionCompact action={availableNextPracticeAction} t={t} />
            </section>
          )}
        </>
      )}

      {progress.status === "ready" && availableNextPracticeAction && (
        <Link
          to={detailHref}
          className="inline-flex text-sm font-medium text-copper hover:underline"
          onClick={() => {
            recordEvent.mutate({
              name: "training.context_next_action_used",
              surface: "week",
              ruleId: availableNextPracticeAction.ruleId,
              direction: availableNextPracticeAction.direction,
            });
          }}
        >
          {t("contextProgress.useAction")}
        </Link>
      )}
      <Link to={detailHref} className="inline-flex text-sm text-copper hover:underline">
        {t("contextProgress.viewAllEvidence")}
      </Link>
    </section>
  );
}
