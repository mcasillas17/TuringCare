import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useRecordContextualProgressEvent } from "@/lib/contextual-progress";
import { OUTCOME_KEYS } from "@/lib/practice-options";
import { LEVEL_KEYS } from "@/lib/progress";
import { dateLabel } from "@/lib/when";
import type {
  ContextualProgress,
  ExactContextEvidence,
  ExactPracticeContext,
  NextPracticeAction,
} from "@turingcare/shared";
import { useEffect, useRef } from "react";
import {
  ContextLabels,
  ContextStatusBadge,
  contextActionDirection,
  contextActionReason,
  serializeContext,
} from "./contextual-progress-presentation";

function EvidenceMeta({
  evidence,
  t,
  locale,
}: {
  evidence: ExactContextEvidence;
  t: ReturnType<typeof useI18n>["t"];
  locale: ReturnType<typeof useI18n>["locale"];
}) {
  if (evidence.status === "not_observed") {
    return <p className="text-sm text-slate-soft">{t("contextProgress.noEvidence")}</p>;
  }

  const lastObserved = evidence.lastObservedAt
    ? dateLabel(evidence.lastObservedAt, new Date(), locale)
    : null;
  return (
    <div className="space-y-1 text-sm text-slate-soft">
      <p>
        {t(
          evidence.successfulDistinctDays === 1
            ? "contextProgress.successfulDay"
            : "contextProgress.successfulDays",
          { days: evidence.successfulDistinctDays },
        )}
      </p>
      {evidence.latestOutcome && (
        <p>
          {t("contextProgress.latestOutcome", {
            outcome: t(OUTCOME_KEYS[evidence.latestOutcome]),
          })}
        </p>
      )}
      {lastObserved && <p>{t("contextProgress.lastObserved", { date: lastObserved })}</p>}
    </div>
  );
}

function StrongestContext({
  evidence,
  headingId,
  t,
  locale,
}: {
  evidence: ExactContextEvidence | null;
  headingId: string;
  t: ReturnType<typeof useI18n>["t"];
  locale: ReturnType<typeof useI18n>["locale"];
}) {
  if (!evidence) {
    return <p className="text-sm text-slate-soft">{t("contextProgress.empty")}</p>;
  }

  return (
    <section aria-labelledby={headingId}>
      <h6 id={headingId} className="font-medium text-slate">
        {t("contextProgress.strongest")}
      </h6>
      <div className="mt-2 space-y-2 rounded border border-silver bg-cream p-3">
        <ContextStatusBadge status={evidence.status} t={t} />
        {evidence.status === "developing" && evidence.latestOutcome === "too_hard" && (
          <p className="text-sm text-slate-soft">{t("contextProgress.needsSupport")}</p>
        )}
        <EvidenceMeta evidence={evidence} t={t} locale={locale} />
        <ContextLabels context={evidence.context} t={t} />
      </div>
    </section>
  );
}

function NextPracticeActionCard({
  action,
  headingId,
  onUse,
  t,
}: {
  action: NextPracticeAction | null;
  headingId: string;
  onUse: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  if (!action) return null;

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h6 id={headingId} className="font-medium text-slate">
        {t("contextProgress.practiceNext")}
      </h6>
      <div className="space-y-2 rounded border border-silver bg-white p-3">
        <p className="text-sm font-medium text-slate">
          {contextActionDirection(action.direction, t)}
        </p>
        <p className="text-sm text-slate-soft">{contextActionReason(action, t)}</p>
        <ContextLabels context={action.context} t={t} />
        <Button type="button" onClick={onUse}>
          {t("contextProgress.useAction")}
        </Button>
      </div>
    </section>
  );
}

function ContextEvidenceRow({
  evidence,
  t,
  locale,
}: {
  evidence: ExactContextEvidence;
  t: ReturnType<typeof useI18n>["t"];
  locale: ReturnType<typeof useI18n>["locale"];
}) {
  return (
    <li className="space-y-2 rounded border border-silver p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ContextStatusBadge status={evidence.status} t={t} />
        {evidence.status === "developing" && evidence.latestOutcome === "too_hard" && (
          <span className="text-xs text-slate-soft">{t("contextProgress.needsSupport")}</span>
        )}
      </div>
      <ContextLabels context={evidence.context} t={t} />
      <EvidenceMeta evidence={evidence} t={t} locale={locale} />
    </li>
  );
}

export function ContextualProgressDetail({
  dogId,
  skillId,
  data,
  isLoading,
  isError,
  refetch,
  onUseNextAction,
}: {
  dogId: string;
  skillId: string;
  data: ContextualProgress | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
  onUseNextAction: (context: ExactPracticeContext) => boolean;
}) {
  const { t, locale } = useI18n();
  const recordEvent = useRecordContextualProgressEvent(dogId);
  const seenResultKeys = useRef(new Set<string>());

  const resultKey = data
    ? `${data.policyVersion}|${data.curriculumLevel}|${serializeContext(data.strongestContext?.context)}|${data.strongestContext?.status ?? "null"}|${Boolean(data.nextPracticeAction)}`
    : null;

  useEffect(() => {
    if (isLoading || isError || !data || !resultKey || seenResultKeys.current.has(resultKey)) {
      return;
    }
    seenResultKeys.current.add(resultKey);
    recordEvent.mutate({
      name: "training.context_insight_viewed",
      surface: "skill_detail",
      strongestStatus: data.strongestContext?.status ?? null,
      hasNextAction: Boolean(data.nextPracticeAction),
    });
  }, [data, isError, isLoading, recordEvent, resultKey]);

  const sectionId = `context-progress-${skillId}`;

  if (isLoading) {
    return (
      <section aria-labelledby={sectionId}>
        <h5 id={sectionId} className="font-medium text-slate">
          {t("contextProgress.title")}
        </h5>
        <output aria-live="polite" className="mt-2 block text-sm text-slate-soft">
          {t("common.loading")}
        </output>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section aria-labelledby={sectionId}>
        <h5 id={sectionId} className="font-medium text-slate">
          {t("contextProgress.title")}
        </h5>
        <div className="mt-2 space-y-2 text-sm text-slate-soft">
          <output>{t("contextProgress.loadError")}</output>
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t("contextProgress.retry")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby={sectionId} className="space-y-3">
      <div>
        <h5 id={sectionId} className="font-medium text-slate">
          {t("contextProgress.title")}
        </h5>
        <p className="text-sm text-slate-soft">
          {t("contextProgress.window", { days: data.window.days })} ·{" "}
          {t("progress.levelBadge", {
            n: data.curriculumLevel,
            label: t(LEVEL_KEYS[data.curriculumLevel - 1] ?? "progress.level1"),
          })}
        </p>
      </div>
      <StrongestContext
        evidence={data.strongestContext}
        headingId={`${sectionId}-strongest`}
        t={t}
        locale={locale}
      />
      <NextPracticeActionCard
        action={data.nextPracticeAction}
        headingId={`${sectionId}-next`}
        t={t}
        onUse={() => {
          if (!data.nextPracticeAction) return;
          const applied = onUseNextAction(data.nextPracticeAction.context);
          if (!applied) return;
          recordEvent.mutate({
            name: "training.context_next_action_used",
            surface: "skill_detail",
            ruleId: data.nextPracticeAction.ruleId,
            direction: data.nextPracticeAction.direction,
          });
        }}
      />
      {data.exactContexts.length > 0 && (
        <section aria-labelledby={`${sectionId}-evidence`} className="space-y-2">
          <h6 id={`${sectionId}-evidence`} className="font-medium text-slate">
            {t("contextProgress.viewEvidence")}
          </h6>
          <ul className="space-y-2">
            {data.exactContexts.map((evidence) => (
              <ContextEvidenceRow
                key={serializeContext(evidence.context)}
                evidence={evidence}
                t={t}
                locale={locale}
              />
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
