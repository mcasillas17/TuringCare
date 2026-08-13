import { OutcomeQuickCapture } from "@/components/progress/outcome-quick-capture";
import { SuggestionCard } from "@/components/training/suggestion-card";
import { useTuring } from "@/components/turing/turing-context";
import { Button } from "@/components/ui/button";
import { FocusPicker } from "@/components/week/focus-picker";
import { WeekGrid } from "@/components/week/week-grid";
import { WeekNav } from "@/components/week/week-nav";
import { useI18n } from "@/i18n";
import { useDeleteSession, useLogSession, useSetSessionEvidence } from "@/lib/progress";
import {
  suggestionKey,
  useAdvancementDecision,
  useSuggestion,
  useSuggestionAction,
} from "@/lib/suggestion";
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
import { focusKey, useFocusWeek } from "@/lib/weekly-focus";
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

export function DogWeek() {
  const { t, locale } = useI18n();
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);

  const days = useMemo(() => weekDays(monday), [monday]);
  const weekKey = weekKeyOf(monday);
  const timezoneOffsetMinutes = monday.getTimezoneOffset();
  const weekEndTimezoneOffsetMinutes = addDays(monday, 7).getTimezoneOffset();
  const { data: focusSkills } = useFocusWeek(
    id,
    weekKey,
    timezoneOffsetMinutes,
    weekEndTimezoneOffsetMinutes,
  );
  const logSession = useLogSession(id);
  const deleteSession = useDeleteSession(id);
  const setEvidence = useSetSessionEvidence(id);
  const currentTimezoneOffsetMinutes = new Date().getTimezoneOffset();
  const currentWeekKey = weekKeyAtOffset(new Date(), currentTimezoneOffsetMinutes);
  const {
    data: suggestion,
    isError: suggestionError,
    isLoading: suggestionLoading,
  } = useSuggestion(id, weekKey, currentTimezoneOffsetMinutes);
  const suggestionAction = useSuggestionAction(id, weekKey);
  const advancementDecision = useAdvancementDecision(id, weekKey);
  const [pendingOutcome, setPendingOutcome] = useState<{
    skillId: string;
    sessionId: string;
    suggestionId: string | null;
    hasPrimary: boolean;
    hasFallback: boolean;
    dimensions: PracticeDimension[];
  } | null>(null);
  const logDisabled = logSession.isPending || (weekKey === currentWeekKey && suggestionLoading);

  const skills = focusSkills ?? [];
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

  const refreshFocus = () => qc.invalidateQueries({ queryKey: focusKey(id, weekKey) });

  const onLog = async (skillId: string, day: Date) => {
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
    refreshFocus();
    if (activeScope.current !== scopeAtStart) return;
    const matchingSuggestion =
      !suggestionError &&
      weekKey === currentWeekKey &&
      suggestion?.type === "exercise" &&
      !suggestion.dismissed &&
      suggestion.weekKey === weekKey &&
      suggestion.skill?.id === skillId;
    setPendingOutcome({
      skillId,
      sessionId: created.id,
      suggestionId: matchingSuggestion ? suggestion.suggestionId : null,
      hasPrimary: matchingSuggestion && suggestion.primary !== null,
      hasFallback: matchingSuggestion && suggestion.fallback !== null,
      dimensions: matchingSuggestion ? suggestion.requestedDimensions : [],
    });
  };

  const onRemove = async (skillId: string, sessionId: string) => {
    await deleteSession.mutateAsync({ skillId, sessionId });
    refreshFocus();
    qc.invalidateQueries({ queryKey: suggestionKey(id, weekKey) });
  };

  const onSaveOutcome = async (
    input: PracticeEvidenceInput & { variant: "primary" | "fallback" },
  ) => {
    if (!pendingOutcome) return;
    const target = pendingOutcome;
    const { variant, ...evidence } = input;
    try {
      await setEvidence.mutateAsync({
        skillId: target.skillId,
        sessionId: target.sessionId,
        body: {
          ...evidence,
          practicedTarget:
            target.suggestionId && (variant === "fallback" ? target.hasFallback : target.hasPrimary)
              ? { suggestionId: target.suggestionId, variant }
              : undefined,
        },
      });
      setPendingOutcome((current) => (current?.sessionId === target.sessionId ? null : current));
      qc.invalidateQueries({ queryKey: suggestionKey(id, weekKey) });
      toast.success(t("practice.outcomeSaved"));
    } catch {
      toast.error(t("practice.outcomeFailed"));
    }
  };

  const onSuggestionAction = async (action: SuggestionAction) => {
    if (weekKey !== currentWeekKey || suggestion?.weekKey !== weekKey || !suggestion.suggestionId) {
      return;
    }
    try {
      await suggestionAction.mutateAsync({ suggestionId: suggestion.suggestionId, action });
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

      {weekKey === currentWeekKey &&
        !suggestionError &&
        suggestion &&
        suggestion.weekKey === weekKey && (
          <SuggestionCard
            suggestion={suggestion}
            onAction={onSuggestionAction}
            onDecision={onAdvancementDecision}
            onPickFocus={() => setPickerOpen(true)}
            actionPending={suggestionAction.isPending}
            decisionPending={advancementDecision.isPending}
          />
        )}
      {weekKey === currentWeekKey && suggestionError && (
        <output className="text-sm text-slate-soft">{t("suggestion.loadError")}</output>
      )}

      {skills.length > 0 && (
        <p className="text-sm text-slate-soft">{t("week.summary", { sessions: sessionCount })}</p>
      )}

      {pendingOutcome && (
        <OutcomeQuickCapture
          key={pendingOutcome.sessionId}
          hasFallback={pendingOutcome.hasFallback}
          dimensions={pendingOutcome.dimensions}
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
        <section className="space-y-3 rounded border border-silver bg-white p-6 text-center">
          <p className="text-slate-soft">{t("week.pickFocus")}</p>
          <Button type="button" className="bg-slate text-cream" onClick={() => setPickerOpen(true)}>
            {t("week.editFocus")}
          </Button>
          <div>
            <Link to={`/my/dogs/${id}/training`} className="text-sm text-copper hover:underline">
              {t("week.goToTraining")}
            </Link>
          </div>
        </section>
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
