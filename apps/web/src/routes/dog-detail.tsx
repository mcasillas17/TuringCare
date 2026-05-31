import { ProgressPanel } from "@/components/progress/progress-panel";
import { TemplatePicker } from "@/components/training/template-picker";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import {
  useAddConcern,
  useAddGoal,
  useDeleteDog,
  useDog,
  useRemoveConcern,
  useRemoveGoal,
} from "@/lib/dogs";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

const inputCls = "flex-1 rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function DogDetail() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const { data, isLoading, isError } = useDog(id);
  const del = useDeleteDog();
  const addConcern = useAddConcern(id);
  const removeConcern = useRemoveConcern(id);
  const addGoal = useAddGoal(id);
  const removeGoal = useRemoveGoal(id);
  const [confirming, setConfirming] = useState(false);
  const [concern, setConcern] = useState("");
  const [severity, setSeverity] = useState<"mild" | "moderate" | "severe">("mild");
  const [goal, setGoal] = useState("");

  if (isLoading) return <p className="p-8">{t("common.loading")}</p>;
  if (isError || !data) return <p className="p-8 text-red-600">{t("dogs.loadError")}</p>;
  const { dog, concerns, goals } = data;
  const sizeLabel: Record<string, string> = {
    small: t("dogs.sizeSmall"),
    medium: t("dogs.sizeMedium"),
    large: t("dogs.sizeLarge"),
    giant: t("dogs.sizeGiant"),
  };
  const sexLabel: Record<string, string> = {
    male: t("dogs.sexMale"),
    female: t("dogs.sexFemale"),
  };
  const sevLabel: Record<string, string> = {
    mild: t("dogs.severityMild"),
    moderate: t("dogs.severityModerate"),
    severe: t("dogs.severitySevere"),
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link to="/my/dogs" className="text-sm text-slate-soft hover:underline">
        ← {t("dogs.back")}
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate">{dog.name}</h1>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to={`/my/dogs/${dog.id}/edit`}>{t("dogs.edit")}</Link>
          </Button>
          <Button asChild className="bg-slate text-cream">
            <Link to={`/my/journal?dogId=${dog.id}`}>{t("journal.logMoment")}</Link>
          </Button>
          {confirming ? (
            <>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await del.mutateAsync(dog.id);
                    toast.success(t("dogs.deleted"));
                    navigate("/my/dogs");
                  } catch {
                    toast.error(t("dogs.saveFailed"));
                  }
                }}
                className="border-red-600 text-red-600"
              >
                {t("dogs.deleteYes")}
              </Button>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                {t("dogs.deleteCancel")}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => setConfirming(true)}>
              {t("dogs.delete")}
            </Button>
          )}
        </div>
      </div>
      {confirming && <p className="text-sm text-red-600">{t("dogs.deleteConfirm")}</p>}

      <section className="rounded border border-silver p-4 text-sm text-slate-soft">
        {dog.breed && (
          <div>
            {t("dogs.fieldBreed")}: {dog.breed}
          </div>
        )}
        <div>
          {t("dogs.fieldSize")}: {sizeLabel[dog.size]}
        </div>
        <div>
          {t("dogs.fieldSex")}: {sexLabel[dog.sex]}
        </div>
        {dog.notes && (
          <div>
            {t("dogs.fieldNotes")}: {dog.notes}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("dogs.concernsTitle")}</h2>
        {concerns.length === 0 && <p className="text-slate-soft">{t("dogs.concernsEmpty")}</p>}
        <ul className="space-y-1">
          {concerns.map((cn) => (
            <li key={cn.id} className="flex items-center justify-between">
              <span>
                {cn.concern} · {sevLabel[cn.severity]}
              </span>
              <Button variant="outline" onClick={() => removeConcern.mutate(cn.id)}>
                {t("dogs.remove")}
              </Button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            className={inputCls}
            placeholder={t("dogs.concernPlaceholder")}
            value={concern}
            onChange={(e) => setConcern(e.target.value)}
          />
          <select
            className="rounded border border-silver bg-white px-2 text-sm"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as "mild" | "moderate" | "severe")}
          >
            <option value="mild">{t("dogs.severityMild")}</option>
            <option value="moderate">{t("dogs.severityModerate")}</option>
            <option value="severe">{t("dogs.severitySevere")}</option>
          </select>
          <Button
            disabled={!concern.trim()}
            onClick={async () => {
              await addConcern.mutateAsync({ concern, severity });
              setConcern("");
            }}
          >
            {t("dogs.addConcern")}
          </Button>
        </div>
      </section>

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
