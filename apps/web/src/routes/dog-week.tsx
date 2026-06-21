import { useTuring } from "@/components/turing/turing-context";
import { Button } from "@/components/ui/button";
import { FocusPicker } from "@/components/week/focus-picker";
import { WeekGrid } from "@/components/week/week-grid";
import { WeekNav } from "@/components/week/week-nav";
import { useI18n } from "@/i18n";
import { useDeleteSession, useLogSession } from "@/lib/progress";
import {
  addDays,
  dayKey,
  mondayOf,
  sameWeek,
  shouldCelebrateWeek,
  weekBounds,
  weekDays,
} from "@/lib/week";
import { focusKey, useFocusWeek } from "@/lib/weekly-focus";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

export function DogWeek() {
  const { t, locale } = useI18n();
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const today = useMemo(() => new Date(), []);
  const [monday, setMonday] = useState(() => mondayOf(new Date()));
  const [pickerOpen, setPickerOpen] = useState(false);

  const { weekStart, weekEnd } = useMemo(() => weekBounds(monday), [monday]);
  const days = useMemo(() => weekDays(monday), [monday]);
  const { data: focusSkills } = useFocusWeek(id, weekStart, weekEnd);
  const logSession = useLogSession(id);
  const deleteSession = useDeleteSession(id);

  const skills = focusSkills ?? [];
  const canGoNext = !sameWeek(monday, today);

  const sessionCount = skills.reduce((sum, s) => sum + s.sessions.length, 0);
  const doneCount = skills.filter((s) => s.sessions.length > 0).length;

  const { celebrate } = useTuring();
  const isCurrentWeek = sameWeek(monday, today);
  const weekComplete = skills.length > 0 && doneCount === skills.length;
  const weekKey = dayKey(monday);
  const prevComplete = useRef<boolean | undefined>(undefined);
  const prevWeekKey = useRef(weekKey);
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
      celebrate(true);
    }
    prevComplete.current = weekComplete;
  }, [focusSkills, weekKey, weekComplete, isCurrentWeek, celebrate]);

  const refreshFocus = () => qc.invalidateQueries({ queryKey: focusKey(id) });

  const onLog = async (skillId: string, day: Date) => {
    const isToday = dayKey(day) === dayKey(today);
    const occurredAt = isToday
      ? new Date().toISOString()
      : new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0).toISOString();
    await logSession.mutateAsync({ skillId, body: { occurredAt } });
    refreshFocus();
  };

  const onRemove = async (skillId: string, sessionId: string) => {
    await deleteSession.mutateAsync({ skillId, sessionId });
    refreshFocus();
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

      {skills.length > 0 && (
        <p className="text-sm text-slate-soft">
          {t("week.summary", { done: doneCount, total: skills.length, sessions: sessionCount })}
        </p>
      )}

      {pickerOpen && (
        <FocusPicker dogId={id} focusSkills={skills} onClose={() => setPickerOpen(false)} />
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
        />
      )}
    </div>
  );
}
