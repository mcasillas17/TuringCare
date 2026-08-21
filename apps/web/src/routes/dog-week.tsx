import { OutcomeQuickCapture } from "@/components/progress/outcome-quick-capture";
import { SafetyNotice } from "@/components/training/safety-notice";
import { SuggestionCard } from "@/components/training/suggestion-card";
import { useTuring } from "@/components/turing/turing-context";
import { Button } from "@/components/ui/button";
import { ContextualProgressSummaryCard } from "@/components/week/contextual-progress-summary";
import { FocusPicker } from "@/components/week/focus-picker";
import { WeekGrid } from "@/components/week/week-grid";
import { WeekNav } from "@/components/week/week-nav";
import { useI18n } from "@/i18n";
import {
  getAuditedSuggestionTarget,
  getAuditedSuggestionTargetState,
} from "@/lib/audited-suggestion";
import { useDeleteSession, useLogSession, useSetSessionEvidence } from "@/lib/progress";
import { useAdvancementDecision, useSuggestion, useSuggestionAction } from "@/lib/suggestion";
import {
  addDays,
  dayKey,
  mondayOf,
  sameWeek,
  shouldCelebrateWeek,
  weekDays,
  weekKeyAtOffset,
  weekKeyOf,
} from "@/lib/week";
import { type FocusSkill, focusKey, useFocusWeek } from "@/lib/weekly-focus";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AdvancementDecision,
  PracticeDimension,
  PracticeEvidenceInput,
  SuggestionAction,
} from "@turingcare/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

type AuditedAnchorOmissionReason = "cache_pending" | "cache_ineligible";

type PendingOutcome = {
  scope: string;
  skillId: string;
  sessionId: string;
  suggestionId: string | null;
  originalAuditedSuggestionId: string | null;
  hasPrimary: boolean;
  hasFallback: boolean;
  dimensions: PracticeDimension[];
  currentLevel: number;
  usesAuditedSuggestion: boolean;
  auditedAnchorOmissionReason?: AuditedAnchorOmissionReason;
};

export function DogWeek() {
  const { t, locale } = useI18n();
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);

  const days = useMemo(() => weekDays(monday), [monday]);
  const weekKey = weekKeyOf(monday);
  const timezoneOffsetMinutes = monday.getTimezoneOffset();
  const weekEndTimezoneOffsetMinutes = addDays(monday, 7).getTimezoneOffset();
  const {
    data: focusSkills,
    isError: focusError,
    isFetching: focusFetching,
    isLoading: focusLoading,
    refetch: refetchFocus,
  } = useFocusWeek(id, weekKey, timezoneOffsetMinutes, weekEndTimezoneOffsetMinutes);
  const logSession = useLogSession(id);
  const deleteSession = useDeleteSession(id);
  const setEvidence = useSetSessionEvidence(id);
  const currentTimezoneOffsetMinutes = new Date().getTimezoneOffset();
  const currentWeekKey = weekKeyAtOffset(new Date(), currentTimezoneOffsetMinutes);
  const {
    data: suggestion,
    isError: suggestionError,
    isFetching: suggestionFetching,
    isLoading: suggestionLoading,
    refetch: refetchSuggestion,
  } = useSuggestion(id, weekKey, currentTimezoneOffsetMinutes);
  const suggestionAction = useSuggestionAction(id, weekKey);
  const advancementDecision = useAdvancementDecision(id);
  const [pendingOutcome, setPendingOutcome] = useState<PendingOutcome | null>(null);
  const logDisabled = logSession.isPending || (weekKey === currentWeekKey && suggestionLoading);

  const skills = focusSkills ?? [];
  const suggestionSafety =
    weekKey === currentWeekKey && suggestion?.weekKey === weekKey && suggestion.safety
      ? suggestion.safety
      : null;
  const summarySafetySkill = skills.find(
    (skill) =>
      skill.contextualProgress.status === "ready" && skill.contextualProgress.summary.safety,
  );
  const summarySafety =
    summarySafetySkill?.contextualProgress.status === "ready"
      ? summarySafetySkill.contextualProgress.summary.safety
      : null;
  const activeSafety = suggestionSafety ?? summarySafety;
  const safetyDataFetching = suggestionFetching || focusFetching;
  const recommendationSuppressionReason =
    activeSafety !== null
      ? "safety"
      : safetyDataFetching
        ? "fetching"
        : focusError || (weekKey === currentWeekKey && suggestionError)
          ? "error"
          : undefined;
  const actionsSuppressed = recommendationSuppressionReason !== undefined;
  const insightSettled =
    !focusLoading &&
    !focusFetching &&
    !focusError &&
    (weekKey !== currentWeekKey || (!suggestionLoading && !suggestionFetching && !suggestionError));
  const canGoNext = !sameWeek(monday, today);

  const sessionCount = skills.reduce((sum, s) => sum + s.sessions.length, 0);
  const doneCount = skills.filter((s) => s.sessions.length > 0).length;

  const { celebrate } = useTuring();
  const isCurrentWeek = sameWeek(monday, today);
  const weekComplete = skills.length > 0 && doneCount === skills.length;
  const prevComplete = useRef<boolean | undefined>(undefined);
  const prevWeekKey = useRef(weekKey);
  const pendingScope = `${id}:${weekKey}`;
  const previousPendingScope = useRef(pendingScope);
  const activeScope = useRef(pendingScope);
  activeScope.current = pendingScope;
  const pendingAuditedSuggestionState =
    pendingOutcome?.usesAuditedSuggestion &&
    pendingOutcome.scope === pendingScope &&
    getAuditedSuggestionTargetState(queryClient, {
      dogId: id,
      weekKey,
      currentWeekKey,
      skillId: pendingOutcome.skillId,
      suggestionId: pendingOutcome.suggestionId ?? undefined,
    }).status;
  // Derived-state trigger: week completion comes from the refetched focus query
  // (not the log-session mutation response), so we watch it here and hop once on
  // a real false->true transition for the current week (refs keep it idempotent).
  useEffect(() => {
    if (focusSkills === undefined) return; // not loaded yet
    if (prevWeekKey.current !== weekKey) {
      prevWeekKey.current = weekKey;
      prevComplete.current = undefined; // new week → re-baseline, no fire
    }
    if (
      shouldCelebrateWeek({ prev: prevComplete.current, complete: weekComplete, isCurrentWeek })
    ) {
      celebrate(true, "turing.celebrateWeek");
    }
    prevComplete.current = weekComplete;
  }, [focusSkills, weekKey, weekComplete, isCurrentWeek, celebrate]);

  useEffect(() => {
    if (previousPendingScope.current === pendingScope) return;
    previousPendingScope.current = pendingScope;
    setPendingOutcome(null);
  }, [pendingScope]);

  useEffect(() => {
    if (!pendingOutcome?.usesAuditedSuggestion || pendingAuditedSuggestionState !== "ineligible") {
      return;
    }
    setPendingOutcome((current) =>
      current?.sessionId === pendingOutcome.sessionId
        ? {
            ...current,
            suggestionId: null,
            hasPrimary: false,
            hasFallback: false,
            usesAuditedSuggestion: false,
            auditedAnchorOmissionReason: "cache_ineligible",
          }
        : current,
    );
  }, [pendingAuditedSuggestionState, pendingOutcome]);

  const onLog = async (skillId: string, day: Date) => {
    const focusSkill = skills.find((skill) => skill.skillId === skillId);
    if (!focusSkill) {
      toast.error(t("progress.saveFailed"));
      return;
    }
    const scopeAtStart = pendingScope;
    const isToday = dayKey(day) === dayKey(today);
    const occurredAt = isToday
      ? new Date().toISOString()
      : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0).toISOString();
    const occurrenceTimezoneOffsetMinutes = new Date(occurredAt).getTimezoneOffset();
    const created = await logSession.mutateAsync({
      skillId,
      body: {
        occurredAt,
        timezoneOffsetMinutes: occurrenceTimezoneOffsetMinutes,
      },
    });
    if (activeScope.current !== scopeAtStart) return;
    const auditedTarget = getAuditedSuggestionTarget(queryClient, {
      dogId: id,
      weekKey,
      currentWeekKey,
      skillId,
    });
    const latestFocusSkill =
      auditedTarget?.focusSkill ??
      queryClient
        .getQueryData<FocusSkill[]>(focusKey(id, weekKey))
        ?.find((focus) => focus.skillId === skillId) ??
      focusSkill;
    const matchingSuggestion = auditedTarget?.suggestion ?? null;
    setPendingOutcome({
      scope: scopeAtStart,
      skillId,
      sessionId: created.session.id,
      suggestionId: matchingSuggestion?.suggestionId ?? null,
      originalAuditedSuggestionId: matchingSuggestion?.suggestionId ?? null,
      hasPrimary: Boolean(matchingSuggestion?.primary),
      hasFallback: Boolean(matchingSuggestion?.fallback),
      dimensions: matchingSuggestion?.requestedDimensions ?? latestFocusSkill.dimensions,
      currentLevel: latestFocusSkill.currentLevel,
      usesAuditedSuggestion: Boolean(matchingSuggestion),
    });
  };

  const onRemove = async (skillId: string, sessionId: string) => {
    await deleteSession.mutateAsync({ skillId, sessionId });
  };

  const onSaveOutcome = async (
    input: PracticeEvidenceInput & { variant: "primary" | "fallback" },
  ) => {
    if (!pendingOutcome) return;
    const target = pendingOutcome;
    const { variant, ...evidence } = input;
    const originalAuditedSuggestionId = target.originalAuditedSuggestionId;
    const canReadAuditedTarget =
      target.scope === pendingScope && activeScope.current === target.scope;
    const auditedTargetState =
      originalAuditedSuggestionId !== null && canReadAuditedTarget
        ? getAuditedSuggestionTargetState(queryClient, {
            dogId: id,
            weekKey,
            currentWeekKey,
            skillId: target.skillId,
            suggestionId: originalAuditedSuggestionId,
          })
        : null;
    const auditedTarget =
      target.usesAuditedSuggestion && auditedTargetState?.status === "eligible"
        ? auditedTargetState.target
        : null;
    const auditedSuggestionId =
      auditedTarget &&
      (variant === "fallback"
        ? auditedTarget.suggestion.fallback
        : auditedTarget.suggestion.primary)
        ? auditedTarget.suggestion.suggestionId
        : null;
    const auditedAnchorOmissionReason =
      target.auditedAnchorOmissionReason ??
      (originalAuditedSuggestionId && !auditedTarget
        ? auditedTargetState?.status === "pending"
          ? "cache_pending"
          : "cache_ineligible"
        : undefined);
    try {
      const result = await setEvidence.mutateAsync({
        skillId: target.skillId,
        sessionId: target.sessionId,
        body: {
          ...evidence,
          practicedTarget:
            auditedSuggestionId && (variant === "fallback" ? target.hasFallback : target.hasPrimary)
              ? { suggestionId: auditedSuggestionId, variant }
              : undefined,
        },
      });
      setPendingOutcome((current) => (current?.sessionId === target.sessionId ? null : current));
      const feedback =
        result.anchorRejected === "practice_day_required"
          ? t("practice.anchorRejectedPracticeDay")
          : result.anchorRejected === "target_locked"
            ? t("practice.anchorRejectedTargetLocked")
            : result.anchorRejected
              ? t("practice.anchorRejectedGeneric")
              : auditedAnchorOmissionReason
                ? t("practice.auditedAnchorOmitted")
                : t("practice.outcomeSaved");
      if (result.anchorRejected || auditedAnchorOmissionReason) {
        toast.warning(feedback);
      } else {
        toast.success(feedback);
      }
    } catch {
      toast.error(t("practice.outcomeFailed"));
    }
  };

  const onSuggestionAction = async (action: SuggestionAction) => {
    if (!suggestion?.skill?.id || !suggestion.suggestionId) return;
    const auditedTarget = getAuditedSuggestionTarget(queryClient, {
      dogId: id,
      weekKey,
      currentWeekKey,
      skillId: suggestion.skill.id,
      suggestionId: suggestion.suggestionId,
    });
    if (!auditedTarget) {
      toast.error(t("suggestion.actionFailed"));
      return;
    }
    try {
      await suggestionAction.mutateAsync({
        suggestionId: suggestion.suggestionId,
        action,
      });
      toast.success(t("suggestion.actionThanks"));
    } catch {
      toast.error(t("suggestion.actionFailed"));
    }
  };

  const onAdvancementDecision = async (proposalId: string, decision: AdvancementDecision) => {
    try {
      await advancementDecision.mutateAsync({ proposalId, decision });
      toast.success(t("suggestion.advSaved"));
    } catch {
      toast.error(t("suggestion.advFailed"));
    }
  };

  const rangeLabel = `${days[0]?.toLocaleDateString(locale, { month: "short", day: "numeric" })} – ${days[6]?.toLocaleDateString(locale, { month: "short", day: "numeric" })}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate">{t("week.title")}</h1>
        <Button type="button" variant="outline" onClick={() => setPickerOpen((v) => !v)}>
          {t("week.editFocus")}
        </Button>
      </div>

      <WeekNav
        rangeLabel={rangeLabel}
        canGoNext={canGoNext}
        onPrev={() => setMonday((m) => addDays(m, -7))}
        onNext={() => setMonday((m) => addDays(m, 7))}
        onThisWeek={() => setMonday(mondayOf(new Date()))}
      />

      {activeSafety && <SafetyNotice safety={activeSafety} />}

      {weekKey === currentWeekKey &&
        !suggestionLoading &&
        !focusError &&
        suggestion &&
        suggestion.weekKey === weekKey &&
        !suggestion.safety && (
          <SuggestionCard
            suggestion={suggestion}
            onAction={onSuggestionAction}
            onDecision={onAdvancementDecision}
            onPickFocus={() => setPickerOpen(true)}
            actionPending={suggestionAction.isPending}
            decisionPending={advancementDecision.isPending}
            suppressionReason={recommendationSuppressionReason}
            onRetry={() => void refetchSuggestion()}
          />
        )}
      {weekKey === currentWeekKey &&
        suggestionError &&
        (!suggestion || suggestion.weekKey !== weekKey) && (
          <div className="space-y-2">
            <output className="block text-sm text-slate-soft">{t("suggestion.loadError")}</output>
            <Button type="button" variant="outline" onClick={() => void refetchSuggestion()}>
              {t("contextProgress.retry")}
            </Button>
          </div>
        )}
      {focusError && (
        <div className="space-y-2">
          <output className="block text-sm text-slate-soft">{t("week.focusLoadError")}</output>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void refetchFocus()}>
              {t("week.retryFocus")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>
              {t("week.editFocus")}
            </Button>
          </div>
        </div>
      )}
      {focusLoading && (
        <output aria-live="polite" className="text-sm text-slate-soft">
          {t("common.loading")}
        </output>
      )}

      {skills.length > 0 && (
        <p className="text-sm text-slate-soft">{t("week.summary", { sessions: sessionCount })}</p>
      )}

      {skills.length > 0 && (
        <div className="space-y-3">
          {skills.map((skill) => (
            <ContextualProgressSummaryCard
              key={skill.skillId}
              dogId={id}
              skill={skill}
              showSafetyNotice={false}
              actionsSuppressed={actionsSuppressed}
              insightSettled={insightSettled}
              onRetry={() => refetchFocus()}
            />
          ))}
        </div>
      )}

      {pendingOutcome && (
        <OutcomeQuickCapture
          key={pendingOutcome.sessionId}
          hasFallback={pendingOutcome.hasFallback}
          dimensions={pendingOutcome.dimensions}
          currentLevel={pendingOutcome.currentLevel}
          usesAuditedSuggestion={pendingOutcome.usesAuditedSuggestion}
          saving={setEvidence.isPending}
          onSave={onSaveOutcome}
          onSkip={() => setPendingOutcome(null)}
        />
      )}

      {pickerOpen && (
        <FocusPicker
          dogId={id}
          weekKey={weekKey}
          focusSkills={skills}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {skills.length === 0 ? (
        focusLoading || focusError ? null : (
          <section className="space-y-3 rounded border border-silver bg-white p-6 text-center">
            <p className="text-slate-soft">{t("week.pickFocus")}</p>
            <Button
              type="button"
              className="bg-slate text-cream"
              onClick={() => setPickerOpen(true)}
            >
              {t("week.editFocus")}
            </Button>
            <div>
              <Link to={`/my/dogs/${id}/training`} className="text-sm text-copper hover:underline">
                {t("week.goToTraining")}
              </Link>
            </div>
          </section>
        )
      ) : (
        <WeekGrid
          focusSkills={skills}
          days={days}
          today={today}
          onLog={onLog}
          onRemove={onRemove}
          logDisabled={logDisabled}
        />
      )}
    </div>
  );
}
