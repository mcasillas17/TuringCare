import { ProgressPanel } from "@/components/progress/progress-panel";
import { TemplatePicker } from "@/components/training/template-picker";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useAddGoal, useDog, useRemoveGoal } from "@/lib/dogs";
import { useState } from "react";
import { useParams } from "react-router-dom";

const inputCls = "flex-1 rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function DogTraining() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const { data: dogData } = useDog(id);
  const addGoal = useAddGoal(id);
  const removeGoal = useRemoveGoal(id);
  const [goal, setGoal] = useState("");

  if (!dogData) return null;
  const { goals } = dogData;

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("dogs.goalsTitle")}</h2>
        {goals.length === 0 && <p className="text-slate-soft">{t("dogs.goalsEmpty")}</p>}
        <ul className="space-y-1">
          {goals.map((g) => (
            <li key={g.id} className="flex items-center justify-between">
              <span>{g.goal}</span>
              <Button variant="outline" onClick={() => removeGoal.mutate(g.id)}>
                {t("dogs.remove")}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-start gap-2">
          <input
            className={inputCls}
            placeholder={t("dogs.goalPlaceholder")}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <Button
            disabled={!goal.trim()}
            onClick={async () => {
              await addGoal.mutateAsync({ goal });
              setGoal("");
            }}
          >
            {t("dogs.addGoal")}
          </Button>
          <TemplatePicker dogId={id} />
        </div>
      </section>

      <ProgressPanel dogId={id} />
    </div>
  );
}
