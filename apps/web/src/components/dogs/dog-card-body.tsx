import { useI18n } from "@/i18n";
import { type DogOverview, useDog } from "@/lib/dogs";
import { useJournal } from "@/lib/journal";
import { useProgress } from "@/lib/progress";
import { timeAgo } from "@/lib/time-ago";
import { humanTime } from "@/lib/when";
import { Link } from "react-router-dom";

export function DogCardBody({ dog }: { dog: DogOverview }) {
  const { t, locale } = useI18n();
  const { summary } = dog;
  const { data: goals } = useProgress(dog.id);
  const { data: entries } = useJournal(dog.id);
  const { data: detail } = useDog(dog.id);
  const recent = (entries ?? []).slice(0, 2);
  const concerns = detail?.concerns ?? [];

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
      {concerns.length > 0 && (
        <section>
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-soft">
            {t("dogs.concernsTitle")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {concerns.map((cn) => (
              <span
                key={cn.id}
                className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700"
              >
                {cn.concern}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* actions */}
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/my/dogs/${dog.id}/journal?compose=moment`}
          className="rounded-lg bg-slate px-3 py-2 text-sm font-bold text-cream"
        >
          {t("dogs.actLogMoment")}
        </Link>
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
    </div>
  );
}
