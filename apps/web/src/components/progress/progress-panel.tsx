import { ContextualProgressDetail } from "@/components/progress/contextual-progress-detail";
import { MilestoneStepper } from "@/components/progress/milestone-stepper";
import { SessionForm } from "@/components/progress/session-form";
import { SafetyNotice } from "@/components/training/safety-notice";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useContextualProgress } from "@/lib/contextual-progress";
import { useRemoveGoal } from "@/lib/dogs";
import { DIMENSION_CONFIG } from "@/lib/practice-options";
import {
  LEVEL_KEYS,
  type ProgressGoal,
  type ProgressSession,
  type ProgressSkill,
  useAddSkill,
  useDeleteSession,
  useDeleteSkill,
  useProgress,
  useUpdateSkill,
} from "@/lib/progress";
import { findCatalogSkill, useTrainingCatalog } from "@/lib/training-catalog";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatDateInUtc } from "@turingcare/i18n";
import {
  type ExactPracticeContext,
  type PracticeDimension,
  type SuggestionSafety,
  type TrainingSkillInput,
  practiceDimensionValues,
  trainingSkillSchema,
} from "@turingcare/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

function sessionCountLabel(skill: ProgressSkill, t: ReturnType<typeof useI18n>["t"]) {
  const label = skill.sessionCount === 1 ? t("progress.session") : t("progress.sessions");
  return `${skill.sessionCount} ${label}`;
}

function formatProgressDate(value: string | null, locale: "en" | "es") {
  if (!value) return null;
  return formatDateInUtc(locale, value, { month: "short", day: "numeric" });
}

function getSessionDimensions(
  catalogDimensions: readonly PracticeDimension[],
  recommendedContext: ExactPracticeContext | null,
): PracticeDimension[] {
  const selected = new Set<PracticeDimension>(catalogDimensions);
  if (recommendedContext) {
    for (const dimension of practiceDimensionValues) {
      const field = DIMENSION_CONFIG[dimension].field;
      if (recommendedContext[field] !== null) selected.add(dimension);
    }
  }
  return practiceDimensionValues.filter((dimension) => selected.has(dimension));
}

export function ProgressPanel({ dogId }: { dogId: string }) {
  const { t } = useI18n();
  const { data, isLoading, isError } = useProgress(dogId);
  const goals = data ?? [];
  const [deepLinkedSkillId, setDeepLinkedSkillId] = useState<string | null>(null);
  const [detailSafetyBySkillId, setDetailSafetyBySkillId] = useState<
    Record<string, SuggestionSafety>
  >({});
  const { hash } = useLocation();

  const handleDetailSafetyChange = useCallback(
    (skillId: string, safety: SuggestionSafety | null) => {
      setDetailSafetyBySkillId((current) => {
        if (safety) {
          const previous = current[skillId];
          if (
            previous?.suppressed === safety.suppressed &&
            previous.ruleId === safety.ruleId &&
            previous.referral === safety.referral
          ) {
            return current;
          }
          return { ...current, [skillId]: safety };
        }
        if (!(skillId in current)) return current;
        const next = { ...current };
        delete next[skillId];
        return next;
      });
    },
    [],
  );
  let pageSafety: SuggestionSafety | null = null;
  for (const goal of goals) {
    for (const skill of goal.skills) {
      const safety = detailSafetyBySkillId[skill.id];
      if (safety) {
        pageSafety = safety;
        break;
      }
    }
    if (pageSafety) break;
  }

  useEffect(() => {
    if (isLoading || !data) return;
    if (!hash.startsWith("#skill-")) return;
    const skillId = hash.slice("#skill-".length);
    if (!data.some((goal) => goal.skills.some((skill) => skill.id === skillId))) return;
    setDeepLinkedSkillId(skillId);
  }, [data, hash, isLoading]);

  return (
    <div className="space-y-3">
      {pageSafety && <SafetyNotice safety={pageSafety} headingLevel="h3" />}
      {isLoading && <p className="text-slate-soft">{t("common.loading")}</p>}
      {isError && <p className="text-red-600">{t("progress.loadError")}</p>}
      {!isLoading && !isError && goals.length === 0 && (
        <p className="text-slate-soft">{t("progress.empty")}</p>
      )}
      {!isLoading &&
        !isError &&
        goals.map((goal) => (
          <GoalSection
            key={goal.id}
            dogId={dogId}
            goal={goal}
            deepLinkedSkillId={deepLinkedSkillId}
            onDetailSafetyChange={handleDetailSafetyChange}
          />
        ))}
    </div>
  );
}

function GoalSection({
  dogId,
  goal,
  deepLinkedSkillId,
  onDetailSafetyChange,
}: {
  dogId: string;
  goal: ProgressGoal;
  deepLinkedSkillId: string | null;
  onDetailSafetyChange: (skillId: string, safety: SuggestionSafety | null) => void;
}) {
  const { t } = useI18n();
  const removeGoal = useRemoveGoal(dogId);

  return (
    <article className="space-y-3 rounded border border-silver bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-slate">{goal.goal}</h3>
          {goal.avgConfidence != null && (
            <span className="rounded bg-cream px-2 py-1 text-xs text-slate-soft">
              {t("progress.avgConfidence")} {goal.avgConfidence.toFixed(1)}/5
            </span>
          )}
        </div>
        <Button
          variant="outline"
          aria-label={t("progress.removeGoal", { name: goal.goal })}
          onClick={() => removeGoal.mutate(goal.id)}
        >
          {t("dogs.remove")}
        </Button>
      </div>
      {goal.skills.length === 0 ? (
        <p className="text-sm text-slate-soft">{t("progress.noSessions")}</p>
      ) : (
        <ul className="space-y-2">
          {goal.skills.map((skill) => (
            <SkillCard
              key={skill.id}
              dogId={dogId}
              skill={skill}
              deepLinkedSkillId={deepLinkedSkillId}
              onDetailSafetyChange={onDetailSafetyChange}
            />
          ))}
        </ul>
      )}
      <AddSkillForm dogId={dogId} goalId={goal.id} />
    </article>
  );
}

function AddSkillForm({ dogId, goalId }: { dogId: string; goalId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const addSkill = useAddSkill(dogId, goalId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<TrainingSkillInput>({
    resolver: zodResolver(trainingSkillSchema),
    defaultValues: { name: "", confidence: 1 },
  });

  const onSubmit = handleSubmit(async (body) => {
    await addSkill.mutateAsync(body);
    reset({ name: "", confidence: 1 });
    setOpen(false);
  });

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        {t("progress.addSkill")}
      </Button>
    );
  }

  return (
    <form
      className="space-y-3 rounded border border-silver bg-cream p-3"
      onSubmit={(event) => {
        event.stopPropagation();
        void onSubmit(event);
      }}
    >
      <SkillFields register={register} />
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting || addSkill.isPending}>
          {isSubmitting || addSkill.isPending ? t("progress.saving") : t("progress.saveSkill")}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          {t("progress.cancel")}
        </Button>
      </div>
    </form>
  );
}

function SkillCard({
  dogId,
  skill,
  deepLinkedSkillId,
  onDetailSafetyChange,
}: {
  dogId: string;
  skill: ProgressSkill;
  deepLinkedSkillId: string | null;
  onDetailSafetyChange: (skillId: string, safety: SuggestionSafety | null) => void;
}) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"view" | "editing" | "logging">("view");
  const [recommendedContext, setRecommendedContext] = useState<ExactPracticeContext | null>(null);
  const updateSkill = useUpdateSkill(dogId);
  const deleteSkill = useDeleteSkill(dogId);
  // Always use the prop (a full ProgressSkill from the progress query). The skill
  // PUT mutation returns a bare DB row without milestones/sessions, so reading it
  // here would crash the stepper/session list after a name edit.
  const displaySkill = skill;
  const lastSession = formatProgressDate(displaySkill.lastSessionAt, locale);
  const { data: catalog } = useTrainingCatalog();
  const catalogSkill = findCatalogSkill(catalog, displaySkill.catalogSkillKey);
  const contextualProgress = useContextualProgress(dogId, displaySkill.id, expanded);
  const dimensions = getSessionDimensions(catalogSkill?.dimensions ?? [], recommendedContext);
  const skillRef = useRef<HTMLLIElement>(null);
  const handleDetailSafetyChange = useCallback(
    (safety: SuggestionSafety | null) => onDetailSafetyChange(displaySkill.id, safety),
    [displaySkill.id, onDetailSafetyChange],
  );

  useEffect(() => {
    if (deepLinkedSkillId !== displaySkill.id) return;
    setExpanded(true);
    const scroll = () => {
      const skillElement = skillRef.current;
      skillElement?.scrollIntoView?.({ block: "start" });
    };
    if (typeof window.requestAnimationFrame === "function") {
      const frame = window.requestAnimationFrame(scroll);
      return () => window.cancelAnimationFrame(frame);
    }
    scroll();
  }, [deepLinkedSkillId, displaySkill.id]);

  return (
    <li
      ref={skillRef}
      id={`skill-${displaySkill.id}`}
      aria-labelledby={`skill-heading-${displaySkill.id}`}
      className="space-y-3 rounded border border-silver p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-1 items-start gap-2">
          <button
            type="button"
            onClick={() =>
              setExpanded((v) => {
                if (v) {
                  setMode("view");
                  setRecommendedContext(null);
                }
                return !v;
              })
            }
            aria-expanded={expanded}
            aria-label={
              expanded
                ? t("progress.collapseSkill", { name: displaySkill.name })
                : t("progress.expandSkill", { name: displaySkill.name })
            }
            className="mt-0.5 text-slate-soft hover:text-slate"
          >
            {expanded ? "▼" : "▶"}
          </button>
          <div className="flex-1">
            <h4 id={`skill-heading-${displaySkill.id}`} className="font-medium text-slate">
              {displaySkill.name}
            </h4>
            {catalogSkill && (
              <div className="text-xs text-slate-soft">{catalogSkill.description}</div>
            )}
            <div className="text-sm text-slate-soft">
              {sessionCountLabel(displaySkill, t)}
              {lastSession ? ` · ${t("progress.lastSession")}: ${lastSession}` : ""}
            </div>
            <span className="mt-1 inline-block rounded-full bg-cream px-2 py-0.5 text-xs font-semibold text-slate-soft">
              {t("progress.levelBadge", {
                n: displaySkill.confidence,
                label: t(LEVEL_KEYS[displaySkill.confidence - 1] ?? "progress.level1"),
              })}
            </span>
          </div>
        </div>
      </div>

      {expanded && (
        <>
          <MilestoneStepper dogId={dogId} skill={displaySkill} />
          <ContextualProgressDetail
            dogId={dogId}
            skillId={displaySkill.id}
            data={contextualProgress.data}
            isLoading={contextualProgress.isLoading}
            isFetching={contextualProgress.isFetching}
            isError={contextualProgress.isError}
            refetch={contextualProgress.refetch}
            showSafetyNotice={false}
            onSafetyChange={handleDetailSafetyChange}
            onUseNextAction={(context) => {
              if (getSessionDimensions([], context).length === 0) {
                toast.error(t("contextProgress.actionUnavailable"));
                return false;
              }
              setRecommendedContext(context);
              setMode("logging");
              return true;
            }}
          />
          {displaySkill.lastNote && (
            <p className="text-sm text-slate-soft">{displaySkill.lastNote}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRecommendedContext(null);
                setMode("logging");
              }}
            >
              {t("progress.logSession")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRecommendedContext(null);
                setMode("editing");
              }}
            >
              {t("progress.edit")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => deleteSkill.mutate(displaySkill.id)}
            >
              {t("progress.removeSkill")}
            </Button>
          </div>

          {mode === "editing" && (
            <EditSkillForm
              dogId={dogId}
              skill={displaySkill}
              submitting={updateSkill.isPending}
              onCancel={() => {
                setRecommendedContext(null);
                setMode("view");
              }}
              onSave={async (body) => {
                await updateSkill.mutateAsync({ skillId: displaySkill.id, body });
                setMode("view");
              }}
            />
          )}
          {mode === "logging" && (
            <SessionForm
              key={recommendedContext ? "recommended" : "blank"}
              dogId={dogId}
              skillId={displaySkill.id}
              dimensions={dimensions}
              currentLevel={displaySkill.confidence}
              onCancel={() => {
                setRecommendedContext(null);
                setMode("view");
              }}
              onSaved={() => {
                setRecommendedContext(null);
                setMode("view");
              }}
              initialEvidence={recommendedContext ?? undefined}
            />
          )}
          <SessionList dogId={dogId} skillId={displaySkill.id} sessions={displaySkill.sessions} />
        </>
      )}
    </li>
  );
}

function EditSkillForm({
  skill,
  submitting,
  onCancel,
  onSave,
}: {
  dogId: string;
  skill: ProgressSkill;
  submitting: boolean;
  onCancel: () => void;
  onSave: (body: TrainingSkillInput) => Promise<void>;
}) {
  const { t } = useI18n();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<TrainingSkillInput>({
    resolver: zodResolver(trainingSkillSchema),
    defaultValues: { name: skill.name, confidence: skill.confidence },
  });
  const onSubmit = handleSubmit((body) => onSave(body));

  return (
    <form
      className="space-y-3 rounded border border-silver bg-cream p-3"
      onSubmit={(event) => {
        event.stopPropagation();
        void onSubmit(event);
      }}
    >
      <SkillFields register={register} />
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting || submitting}>
          {isSubmitting || submitting ? t("progress.saving") : t("progress.saveSkill")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("progress.cancel")}
        </Button>
      </div>
    </form>
  );
}

function SkillFields({
  register,
}: {
  register: ReturnType<typeof useForm<TrainingSkillInput>>["register"];
}) {
  const { t } = useI18n();
  return (
    <>
      <label className="block">
        <span className="text-sm">{t("progress.skillName")}</span>
        <input className={input} placeholder={t("progress.skillNamePh")} {...register("name")} />
      </label>
    </>
  );
}

function SessionList({
  dogId,
  skillId,
  sessions,
}: {
  dogId: string;
  skillId: string;
  sessions: ProgressSession[];
}) {
  const { locale, t } = useI18n();
  const deleteSession = useDeleteSession(dogId);

  if (sessions.length === 0)
    return <p className="text-sm text-slate-soft">{t("progress.noSessions")}</p>;

  return (
    <ul className="space-y-1 border-t border-silver pt-2">
      {sessions.map((session) => {
        const sessionDate = formatDateInUtc(locale, session.occurredAt, {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        const duration =
          session.durationMinutes == null
            ? null
            : t(session.durationMinutes === 1 ? "units.minuteOne" : "units.minuteOther", {
                n: session.durationMinutes,
              });
        const details = [sessionDate, duration, session.notes].filter((detail): detail is string =>
          Boolean(detail),
        );

        return (
          <li
            key={session.id}
            className="flex items-start justify-between gap-2 text-sm text-slate-soft"
          >
            <span>{details.join(" · ")}</span>
            <Button
              type="button"
              variant="outline"
              onClick={() => deleteSession.mutate({ skillId, sessionId: session.id })}
            >
              {t("progress.removeSession")}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
