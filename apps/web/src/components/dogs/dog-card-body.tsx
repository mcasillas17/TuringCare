import { DailyCheckInComposer } from "@/components/journal/daily-check-in-composer";
import { QuickMomentComposer } from "@/components/journal/quick-moment-composer";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n";
import { type DogOverview, useAddConcern, useDog, useRemoveConcern } from "@/lib/dogs";
import { useJournal } from "@/lib/journal";
import { useProgress } from "@/lib/progress";
import { timeAgo } from "@/lib/time-ago";
import { humanTime } from "@/lib/when";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";

type Sev = "mild" | "moderate" | "severe";

export function DogCardBody({ dog }: { dog: DogOverview }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const { summary } = dog;
  const { data: goals } = useProgress(dog.id);
  const { data: entries } = useJournal(dog.id);
  const { data: detail } = useDog(dog.id);
  const addConcern = useAddConcern(dog.id);
  const removeConcern = useRemoveConcern(dog.id);
  const recent = (entries ?? []).slice(0, 2);
  const concerns = detail?.concerns ?? [];

  const [sheet, setSheet] = useState<"moment" | "daily_checkin" | null>(null);
  const [concern, setConcern] = useState("");
  const [severity, setSeverity] = useState<Sev>("mild");

  const closeSheet = () => {
    setSheet(null);
    qc.invalidateQueries({ queryKey: ["dogs-overview"] });
  };
  const dogList = [{ id: dog.id, name: dog.name }];

  return (
    <div className="space-y-4 border-t border-silver bg-cream/40 p-4">
      {/* stat strip */}
      <div className="flex gap-2">
        <div className="flex-1 rounded-xl border border-silver bg-white p-3">
          <div className="text-base font-bold text-slate">{summary.journalCount}</div>
          <div className="text-xs text-slate-soft">
            {t("dogs.statJournal")}
            {summary.lastActivityAt ? ` · ${timeAgo(t, summary.lastActivityAt)}` : ""}
          </div>
        </div>
        <div className="flex-1 rounded-xl border border-silver bg-white p-3">
          <div className="text-base font-bold text-slate">
            {summary.avgLevel != null ? `${summary.avgLevel}/5` : "—"}
          </div>
          <div className="text-xs text-slate-soft">{t("dogs.statLevel")}</div>
        </div>
        <div className="flex-1 rounded-xl border border-silver bg-white p-3">
          <div className="text-base font-bold text-slate">
            {summary.briefStatus === "finalized"
              ? t("dogs.briefFinal", { version: summary.briefVersion ?? 1 })
              : summary.briefStatus === "draft"
                ? t("dogs.briefDraft", { version: summary.briefVersion ?? 1 })
                : "—"}
          </div>
          <div className="text-xs text-slate-soft">{t("dogs.statBrief")}</div>
        </div>
      </div>

      {/* training */}
      <section>
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-soft">
          <span>{t("dogs.cardTraining")}</span>
          <Link to={`/my/dogs/${dog.id}/training`} className="font-bold text-copper">
            {t("dogs.openTraining")}
          </Link>
        </div>
        {(goals ?? []).length === 0 ? (
          <p className="text-sm text-slate-soft">{t("dogs.cardNoGoals")}</p>
        ) : (
          (goals ?? []).map((g) => (
            <div key={g.id} className="mb-2 rounded-xl border border-silver bg-white p-3">
              <div className="mb-1.5 text-sm font-semibold text-slate">{g.goal}</div>
              <div className="flex flex-wrap gap-1.5">
                {g.skills.map((s) => (
                  <span
                    key={s.id}
                    className="rounded-full border border-silver bg-cream px-2 py-0.5 text-xs text-slate"
                  >
                    {s.name} <span className="font-bold text-copper">L{s.confidence}</span>
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      {/* recent activity */}
      <section>
        <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide text-slate-soft">
          <span>{t("dogs.cardRecent")}</span>
          <Link to={`/my/dogs/${dog.id}/journal`} className="font-bold text-copper">
            {t("dogs.journalLink")}
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-soft">{t("dogs.cardNoActivity")}</p>
        ) : (
          recent.map((e) => (
            <div
              key={e.id}
              className="border-b border-silver/60 py-1.5 text-sm text-slate last:border-0"
            >
              {e.note} <span className="text-slate-soft">· {humanTime(e.occurredAt, locale)}</span>
            </div>
          ))
        )}
      </section>

      {/* concerns */}
      <section>
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-soft">
          {t("dogs.concernsTitle")}
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {concerns.map((cn) => (
            <span
              key={cn.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700"
            >
              {cn.concern}
              <button
                type="button"
                aria-label={t("dogs.removeConcern", { name: cn.concern })}
                onClick={() => removeConcern.mutate(cn.id)}
                className="text-red-500 hover:text-red-800"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="flex-1 rounded border border-silver bg-white px-2 py-1.5 text-sm"
            placeholder={t("dogs.concernPlaceholder")}
            value={concern}
            onChange={(e) => setConcern(e.target.value)}
          />
          <select
            className="rounded border border-silver bg-white px-2 text-sm"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Sev)}
          >
            <option value="mild">{t("dogs.severityMild")}</option>
            <option value="moderate">{t("dogs.severityModerate")}</option>
            <option value="severe">{t("dogs.severitySevere")}</option>
          </select>
          <button
            type="button"
            disabled={!concern.trim()}
            className="rounded-lg border border-silver bg-white px-3 py-1.5 text-sm font-bold text-slate disabled:opacity-50"
            onClick={async () => {
              await addConcern.mutateAsync({ concern, severity });
              setConcern("");
            }}
          >
            {t("dogs.addConcern")}
          </button>
        </div>
      </section>

      {/* actions */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSheet("moment")}
          className="rounded-lg bg-slate px-3 py-2 text-sm font-bold text-cream"
        >
          ＋ {t("journal.logMoment")}
        </button>
        <button
          type="button"
          onClick={() => setSheet("daily_checkin")}
          className="rounded-lg border border-silver bg-white px-3 py-2 text-sm font-bold text-slate"
        >
          📋 {t("journal.dailyCheckIn")}
        </button>
        <Link
          to={`/my/dogs/${dog.id}/brief`}
          className="rounded-lg border border-silver bg-white px-3 py-2 text-sm font-bold text-slate"
        >
          {t("dogs.actBrief")}
        </Link>
        <Link
          to={`/my/dogs/${dog.id}/week`}
          className="rounded-lg border border-silver bg-white px-3 py-2 text-sm font-bold text-slate"
        >
          {t("dogs.actWeek")}
        </Link>
        <Link
          to={`/my/dogs/${dog.id}/edit`}
          className="rounded-lg border border-silver bg-white px-3 py-2 text-sm font-bold text-slate"
        >
          {t("dogs.actEdit")}
        </Link>
      </div>

      <Sheet
        open={sheet === "moment"}
        title={t("journal.logMoment")}
        closeLabel={t("journal.closeSheet")}
        onClose={closeSheet}
      >
        <QuickMomentComposer
          dogs={dogList}
          selectedDogId={dog.id}
          onDogChange={() => {}}
          autoFocus
          onSaved={closeSheet}
        />
      </Sheet>
      <Sheet
        open={sheet === "daily_checkin"}
        title={t("journal.dailyCheckIn")}
        closeLabel={t("journal.closeSheet")}
        onClose={closeSheet}
      >
        <DailyCheckInComposer
          dogs={dogList}
          selectedDogId={dog.id}
          onDogChange={() => {}}
          autoFocus
          onSaved={closeSheet}
        />
      </Sheet>
    </div>
  );
}
