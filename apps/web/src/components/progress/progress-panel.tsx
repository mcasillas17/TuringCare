import { MilestoneStepper } from "@/components/progress/milestone-stepper";
import { SessionForm } from "@/components/progress/session-form";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import {
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
import { type TrainingSkillInput, trainingSkillSchema } from "@turingcare/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";
const genericKeys = [
  "progress.level1",
  "progress.level2",
  "progress.level3",
  "progress.level4",
  "progress.level5",
] as const;

function sessionCountLabel(skill: ProgressSkill, t: ReturnType<typeof useI18n>["t"]) {
  const label = skill.sessionCount === 1 ? t("progress.session") : t("progress.sessions");
  return `${skill.sessionCount} ${label}`;
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(value),
  );
}

export function ProgressPanel({ dogId }: { dogId: string }) {
  const { t } = useI18n();
  const { data, isLoading, isError } = useProgress(dogId);
  const goals = data ?? [];

  return (
    <section className="space-y-3 rounded border border-silver p-4">
      <div>
        <h2 className="font-semibold text-slate">{t("progress.title")}</h2>
        <p className="text-sm text-slate-soft">{t("progress.confidence")}: 1-5</p>
      </div>
      {isLoading && <p className="text-slate-soft">{t("common.loading")}</p>}
      {isError && <p className="text-red-600">{t("progress.loadError")}</p>}
      {!isLoading && !isError && goals.length === 0 && (
        <p className="text-slate-soft">{t("progress.empty")}</p>
      )}
      {!isLoading &&
        !isError &&
        goals.map((goal) => <GoalSection key={goal.id} dogId={dogId} goal={goal} />)}
    </section>
  );
}

function GoalSection({ dogId, goal }: { dogId: string; goal: ProgressGoal }) {
  const { t } = useI18n();

  return (
    <article className="space-y-3 rounded border border-silver bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-slate">{goal.goal}</h3>
        {goal.avgConfidence != null && (
          <span className="rounded bg-cream px-2 py-1 text-xs text-slate-soft">
            {t("progress.avgConfidence")} {goal.avgConfidence.toFixed(1)}/5
          </span>
        )}
      </div>
      {goal.skills.length === 0 ? (
        <p className="text-sm text-slate-soft">{t("progress.noSessions")}</p>
      ) : (
        <ul className="space-y-2">
          {goal.skills.map((skill) => (
            <SkillCard key={skill.id} dogId={dogId} skill={skill} />
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
        onSubmit();
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

function SkillCard({ dogId, skill }: { dogId: string; skill: ProgressSkill }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"view" | "editing" | "logging">("view");
  const updateSkill = useUpdateSkill(dogId);
  const deleteSkill = useDeleteSkill(dogId);
  const displaySkill = (updateSkill.data as ProgressSkill | undefined) ?? skill;
  const lastSession = formatDate(displaySkill.lastSessionAt);
  const { data: catalog } = useTrainingCatalog();
  const catalogSkill = findCatalogSkill(catalog, displaySkill.catalogSkillKey);

  return (
    <li className="space-y-3 rounded border border-silver p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-1 items-start gap-2">
          <button
            type="button"
            onClick={() =>
              setExpanded((v) => {
                if (v) setMode("view");
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
            <div className="font-medium text-slate">{displaySkill.name}</div>
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
                label: t(genericKeys[displaySkill.confidence - 1] ?? "progress.level1"),
              })}
            </span>
          </div>
        </div>
      </div>

      {expanded && (
        <>
          <MilestoneStepper dogId={dogId} skill={displaySkill} />
          {displaySkill.lastNote && (
            <p className="text-sm text-slate-soft">{displaySkill.lastNote}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => setMode("logging")}>
              {t("progress.logSession")}
            </Button>
            <Button type="button" variant="outline" onClick={() => setMode("editing")}>
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
              onCancel={() => setMode("view")}
              onSave={async (body) => {
                await updateSkill.mutateAsync({ skillId: displaySkill.id, body });
                setMode("view");
              }}
            />
          )}
          {mode === "logging" && (
            <SessionForm
              dogId={dogId}
              skillId={displaySkill.id}
              onCancel={() => setMode("view")}
              onSaved={() => setMode("view")}
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
        onSubmit();
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
  const { t } = useI18n();
  const deleteSession = useDeleteSession(dogId);

  if (sessions.length === 0)
    return <p className="text-sm text-slate-soft">{t("progress.noSessions")}</p>;

  return (
    <ul className="space-y-1 border-t border-silver pt-2">
      {sessions.map((session) => (
        <li
          key={session.id}
          className="flex items-start justify-between gap-2 text-sm text-slate-soft"
        >
          <span>
            {String(session.occurredAt).slice(0, 10)}
            {session.durationMinutes != null ? ` · ${session.durationMinutes} min` : ""}
            {session.notes ? ` · ${session.notes}` : ""}
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={() => deleteSession.mutate({ skillId, sessionId: session.id })}
          >
            {t("progress.removeSession")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
