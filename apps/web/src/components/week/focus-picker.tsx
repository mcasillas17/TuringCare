import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useProgress } from "@/lib/progress";
import type { FocusSkill } from "@/lib/weekly-focus";
import { useAddFocus, useRemoveFocus } from "@/lib/weekly-focus";
import { toast } from "sonner";

type Props = {
  dogId: string;
  weekKey: string;
  focusSkills: FocusSkill[];
  onClose: () => void;
};

export function FocusPicker({ dogId, weekKey, focusSkills, onClose }: Props) {
  const { t } = useI18n();
  const { data: goals } = useProgress(dogId);
  const add = useAddFocus(dogId, weekKey);
  const remove = useRemoveFocus(dogId, weekKey);
  const selectedId = focusSkills[0]?.skillId ?? null;
  const goalList = goals ?? [];
  const hasSkills = goalList.some((g) => g.skills.length > 0);
  const pending = add.isPending || remove.isPending;

  return (
    <section className="space-y-3 rounded border border-silver bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate">{t("week.pickerTitle")}</h2>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("week.pickerDone")}
        </Button>
      </div>
      {!hasSkills && <p className="text-slate-soft text-sm">{t("week.noSkills")}</p>}
      <div role="radiogroup" aria-label={t("week.selectFocusSkill")} className="space-y-3">
        {goalList.map((goal) =>
          goal.skills.length === 0 ? null : (
            <div key={goal.id} className="space-y-1">
              <div className="text-xs font-medium text-slate-soft">{goal.goal}</div>
              <div className="space-y-1">
                {goal.skills.map((skill) => (
                  <label
                    key={skill.id}
                    className="flex cursor-pointer items-center gap-2 text-sm text-slate"
                  >
                    <input
                      type="radio"
                      name="focus-skill"
                      checked={selectedId === skill.id}
                      disabled={pending}
                      onChange={() => {
                        if (selectedId === skill.id) return;
                        add.mutate(skill.id, {
                          onSuccess: () => toast.success(t("week.focusReplaced")),
                          onError: () => toast.error(t("week.focusUpdateFailed")),
                        });
                      }}
                    />
                    {skill.name}
                  </label>
                ))}
              </div>
            </div>
          ),
        )}
      </div>
      {selectedId && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() =>
            remove.mutate(selectedId, {
              onError: () => toast.error(t("week.focusUpdateFailed")),
            })
          }
        >
          {t("week.clearFocus")}
        </Button>
      )}
    </section>
  );
}
