import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useProgress } from "@/lib/progress";
import type { FocusSkill } from "@/lib/weekly-focus";
import { useAddFocus, useRemoveFocus } from "@/lib/weekly-focus";

type Props = {
  dogId: string;
  focusSkills: FocusSkill[];
  onClose: () => void;
};

export function FocusPicker({ dogId, focusSkills, onClose }: Props) {
  const { t } = useI18n();
  const { data: goals } = useProgress(dogId);
  const add = useAddFocus(dogId);
  const remove = useRemoveFocus(dogId);
  const focusedIds = new Set(focusSkills.map((f) => f.skillId));
  const goalList = goals ?? [];
  const hasSkills = goalList.some((g) => g.skills.length > 0);

  return (
    <section className="space-y-3 rounded border border-silver bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate">{t("week.pickerTitle")}</h2>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("week.pickerDone")}
        </Button>
      </div>
      {!hasSkills && <p className="text-slate-soft text-sm">{t("week.noSkills")}</p>}
      {goalList.map((goal) =>
        goal.skills.length === 0 ? null : (
          <div key={goal.id} className="space-y-1">
            <div className="text-xs font-medium text-slate-soft">{goal.goal}</div>
            <ul className="space-y-1">
              {goal.skills.map((skill) => {
                const focused = focusedIds.has(skill.id);
                return (
                  <li key={skill.id} className="flex items-center justify-between gap-2">
                    <span className="text-sm text-slate">{skill.name}</span>
                    <Button
                      type="button"
                      variant={focused ? "default" : "outline"}
                      onClick={() => (focused ? remove.mutate(skill.id) : add.mutate(skill.id))}
                    >
                      {focused ? t("week.inFocus") : t("week.addToFocus")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ),
      )}
    </section>
  );
}
