import { ProgressPanel } from "@/components/progress/progress-panel";
import { TemplatePicker } from "@/components/training/template-picker";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useAddGoal } from "@/lib/dogs";
import { useState } from "react";
import { useParams } from "react-router-dom";

const inputCls = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function DogTraining() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const addGoal = useAddGoal(id);
  const [adding, setAdding] = useState(false);
  const [goal, setGoal] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate">{t("progress.goalsAndSkills")}</h2>
        <div className="flex gap-2">
          <TemplatePicker dogId={id} />
          <Button onClick={() => setAdding((v) => !v)} className="bg-slate text-cream">
            ＋ {t("dogs.addGoal")}
          </Button>
        </div>
      </div>

      {adding && (
        <div className="flex flex-wrap items-start gap-2 rounded-xl border border-silver bg-cream p-3">
          <input
            // biome-ignore lint/a11y/noAutofocus: focus the new-goal field when opened
            autoFocus
            className={inputCls}
            placeholder={t("dogs.goalPlaceholder")}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <Button
            disabled={!goal.trim() || addGoal.isPending}
            onClick={async () => {
              await addGoal.mutateAsync({ goal });
              setGoal("");
              setAdding(false);
            }}
          >
            {t("dogs.addGoal")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setGoal("");
              setAdding(false);
            }}
          >
            {t("dogs.cancel")}
          </Button>
        </div>
      )}

      <ProgressPanel dogId={id} />
    </div>
  );
}
