import { RecentActivity } from "@/components/dog-hub/recent-activity";
import { SpokeCard } from "@/components/dog-hub/spoke-card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useBrief } from "@/lib/brief";
import { useAddConcern, useDog, useRemoveConcern } from "@/lib/dogs";
import { useJournal } from "@/lib/journal";
import { useProgress } from "@/lib/progress";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

const inputCls = "flex-1 rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

type Translate = ReturnType<typeof useI18n>["t"];

function timeAgo(t: Translate, iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return t("dogHub.today");
  if (days < 7) return t("dogHub.daysAgo", { n: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t("dogHub.weeksAgo", { n: weeks });
  const months = Math.floor(days / 30);
  return t("dogHub.monthsAgo", { n: Math.max(months, 1) });
}

export function DogHub() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const { data: dogData } = useDog(id);
  const { data: entries } = useJournal(id || undefined);
  const { data: progressGoals } = useProgress(id);
  const { data: brief } = useBrief(id);
  const addConcern = useAddConcern(id);
  const removeConcern = useRemoveConcern(id);
  const [concern, setConcern] = useState("");
  const [severity, setSeverity] = useState<"mild" | "moderate" | "severe">("mild");

  if (!dogData) return null;
  const { dog, concerns } = dogData;

  const entryList = entries ?? [];
  const journalMetric = entryList.length
    ? t("dogHub.journalMetric", {
        n: entryList.length,
        ago: timeAgo(t, entryList[0] ? String(entryList[0].occurredAt) : null) ?? "",
      })
    : t("dogHub.journalEmpty");

  const goals = progressGoals ?? [];
  const skillCount = goals.reduce((sum, g) => sum + g.skills.length, 0);
  const confidences = goals.flatMap((g) => g.skills.map((s) => s.confidence));
  const avg = confidences.length
    ? (confidences.reduce((sum, c) => sum + c, 0) / confidences.length).toFixed(1)
    : "0.0";
  const trainingMetric = goals.length
    ? t("dogHub.trainingMetric", { goals: goals.length, skills: skillCount, avg })
    : t("dogHub.trainingEmpty");

  const briefMetric = brief
    ? t("dogHub.briefMetric", {
        status:
          brief.status === "finalized" ? t("dogHub.statusFinalized") : t("dogHub.statusDraft"),
        version: brief.version,
        ago: timeAgo(t, brief.generatedAt) ?? "",
      })
    : t("dogHub.briefEmpty");

  const sevLabel: Record<string, string> = {
    mild: t("dogs.severityMild"),
    moderate: t("dogs.severityModerate"),
    severe: t("dogs.severitySevere"),
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <SpokeCard
          to={`/my/dogs/${dog.id}/journal`}
          title={t("dogHub.journalCard")}
          metric={journalMetric}
          isEmpty={entryList.length === 0}
        />
        <SpokeCard
          to={`/my/dogs/${dog.id}/training`}
          title={t("dogHub.trainingCard")}
          metric={trainingMetric}
          isEmpty={goals.length === 0}
        />
        <SpokeCard
          to={`/my/dogs/${dog.id}/brief`}
          title={t("dogHub.briefCard")}
          metric={briefMetric}
          isEmpty={!brief}
        />
      </div>

      <Button asChild className="bg-slate text-cream">
        <Link to={`/my/dogs/${dog.id}/journal?compose=moment`}>{t("dogHub.logAMoment")}</Link>
      </Button>

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
        <div className="flex flex-wrap gap-2">
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

      <RecentActivity entries={entryList} seeAllHref={`/my/dogs/${dog.id}/journal`} />
    </div>
  );
}
