import { useI18n } from "@/i18n";
import { useRecordContextualProgressEvent } from "@/lib/contextual-progress";
import { DIMENSION_CONFIG } from "@/lib/practice-options";
import type { FocusSkill } from "@/lib/weekly-focus";
import type {
  ExactContextEvidence,
  ExactPracticeContext,
  NextPracticeAction,
  PracticeDimension,
} from "@turingcare/shared";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

const CONTEXT_DIMENSIONS = [
  { dimension: "cue_support", field: "cueSupport", labelKey: "contextProgress.cueSupport" },
  { dimension: "environment", field: "environment", labelKey: "contextProgress.environment" },
  { dimension: "distance", field: "distance", labelKey: "contextProgress.distance" },
  { dimension: "duration", field: "durationBand", labelKey: "contextProgress.durationBand" },
  { dimension: "distraction", field: "distraction", labelKey: "contextProgress.distraction" },
] as const;

function statusLabel(status: ExactContextEvidence["status"], t: ReturnType<typeof useI18n>["t"]) {
  if (status === "reliable") return t("contextProgress.reliable");
  if (status === "developing") return t("contextProgress.developing");
  return t("contextProgress.notObserved");
}

function contextValueLabel(
  dimension: PracticeDimension,
  value: string | null,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (value === null) return t("contextProgress.notRecorded");
  const option = DIMENSION_CONFIG[dimension].options.find((candidate) => candidate.value === value);
  return option ? t(option.labelKey) : value;
}

function ContextLabels({
  context,
  t,
}: {
  context: ExactPracticeContext;
  t: ReturnType<typeof useI18n>["t"];
}) {
  return (
    <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
      {CONTEXT_DIMENSIONS.map(({ dimension, field, labelKey }) => (
        <div key={field}>
          <dt className="text-xs text-slate-soft">{t(labelKey)}</dt>
          <dd className="text-sm text-slate">{contextValueLabel(dimension, context[field], t)}</dd>
        </div>
      ))}
    </dl>
  );
}

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
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
          evidence.status === "reliable"
            ? "bg-emerald-50 text-emerald-800"
            : evidence.status === "developing"
              ? "bg-amber-50 text-amber-900"
              : "bg-cream text-slate-soft"
        }`}
      >
        {statusLabel(evidence.status, t)}
      </span>
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
      <ContextLabels context={evidence.context} t={t} />
    </div>
  );
}

function actionDirection(
  direction: NextPracticeAction["direction"],
  t: ReturnType<typeof useI18n>["t"],
) {
  if (direction === "easier") return t("contextProgress.directionEasier");
  if (direction === "harder") return t("contextProgress.directionHarder");
  return t("contextProgress.directionRepeat");
}

function actionReason(action: NextPracticeAction, t: ReturnType<typeof useI18n>["t"]) {
  if (action.ruleId === "ease_after_too_hard") return t("contextProgress.reasonEasier");
  if (action.ruleId === "advance_reliable_context") return t("contextProgress.reasonHarder");
  return t("contextProgress.reasonRepeat");
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
      <p className="text-sm font-medium text-slate">{actionDirection(action.direction, t)}</p>
      <p className="text-sm text-slate-soft">{actionReason(action, t)}</p>
      <ContextLabels context={action.context} t={t} />
    </div>
  );
}

export function ContextualProgressSummaryCard({
  dogId,
  skill,
}: {
  dogId: string;
  skill: Pick<FocusSkill, "skillId" | "name" | "contextualProgress">;
}) {
  const { t } = useI18n();
  const recordEvent = useRecordContextualProgressEvent(dogId);
  const viewRecorded = useRef(false);
  const progress = skill.contextualProgress;
  const summary = progress.status === "ready" ? progress.summary : null;
  const detailHref = `/my/dogs/${dogId}/training#skill-${skill.skillId}`;

  useEffect(() => {
    if (progress.status !== "ready" || viewRecorded.current) return;
    viewRecorded.current = true;
    recordEvent.mutate({
      name: "training.context_insight_viewed",
      surface: "week",
      strongestStatus: progress.summary.strongestContext?.status ?? null,
      hasNextAction: Boolean(progress.summary.nextPracticeAction),
    });
  }, [progress, recordEvent]);

  return (
    <section
      aria-labelledby={`week-context-${skill.skillId}`}
      className="space-y-2 rounded border border-silver bg-white p-3"
    >
      <div>
        <h3 id={`week-context-${skill.skillId}`} className="font-medium text-slate">
          {skill.name}
        </h3>
        <p className="text-sm text-slate-soft">{t("contextProgress.recentWindow", { days: 21 })}</p>
      </div>

      {progress.status === "unavailable" ? (
        <output className="block text-sm text-slate-soft">{t("contextProgress.loadError")}</output>
      ) : (
        <>
          <section aria-labelledby={`week-context-${skill.skillId}-strongest`}>
            <h4
              id={`week-context-${skill.skillId}-strongest`}
              className="text-sm font-medium text-slate"
            >
              {t("contextProgress.strongest")}
            </h4>
            <StrongestContextCompact evidence={summary?.strongestContext ?? null} t={t} />
          </section>
          <section aria-labelledby={`week-context-${skill.skillId}-next`}>
            <h4
              id={`week-context-${skill.skillId}-next`}
              className="text-sm font-medium text-slate"
            >
              {t("contextProgress.practiceNext")}
            </h4>
            <NextActionCompact action={summary?.nextPracticeAction ?? null} t={t} />
          </section>
        </>
      )}

      {progress.status === "ready" && progress.summary.nextPracticeAction && (
        <Link
          to={detailHref}
          className="inline-flex text-sm font-medium text-copper hover:underline"
          onClick={() => {
            const action = progress.summary.nextPracticeAction;
            if (!action) return;
            recordEvent.mutate({
              name: "training.context_next_action_used",
              surface: "week",
              ruleId: action.ruleId,
              direction: action.direction,
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
