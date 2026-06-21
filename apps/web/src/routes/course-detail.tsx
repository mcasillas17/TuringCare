import { useI18n } from "@/i18n";
import { useCourse } from "@/lib/courses";
import { track } from "@/lib/track";
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";

export function CourseDetail() {
  const { t } = useI18n();
  const { id = "" } = useParams();
  const { data: co, isLoading, isError } = useCourse(id);
  useEffect(() => {
    if (id) track("course.viewed", { id });
  }, [id]);
  if (isLoading) return <p>{t("common.loading")}</p>;
  if (isError || !co) return <p className="text-red-600">{t("courses.loadError")}</p>;

  const ageLabel: Record<string, string> = {
    puppy: t("courses.agePuppy"),
    adolescent: t("courses.ageAdolescent"),
    adult: t("courses.ageAdult"),
    any: t("courses.ageAny"),
  };
  const fmtLabel: Record<string, string> = {
    group: t("courses.formatGroup"),
    workshop: t("courses.formatWorkshop"),
    seminar: t("courses.formatSeminar"),
    private: t("courses.formatPrivate"),
    drop_in: t("courses.formatDropIn"),
  };
  const meta = [
    fmtLabel[co.format] ?? co.format,
    co.durationWeeks ? `${co.durationWeeks} ${t("courses.weeks")}` : null,
    co.sessionMinutes ? `${co.sessionMinutes} ${t("courses.minutesPerSession")}` : null,
    co.isOnline ? t("courses.online") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const ageLine = co.ageRange
    ? ` · ${ageLabel[co.ageGroup] ?? co.ageGroup} (${co.ageRange})`
    : ` · ${ageLabel[co.ageGroup] ?? co.ageGroup}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/courses" className="text-sm text-slate-soft hover:underline">
        ← {t("courses.back")}
      </Link>
      <h1 className="text-2xl font-bold text-slate">{co.name}</h1>
      <p className="text-slate-soft">
        {meta}
        {ageLine}
      </p>
      <p className="text-sm text-slate">
        {t("courses.offeredBy")}: {co.organizationName} · {co.city}, {co.state}
      </p>
      {co.description && <p className="text-slate">{co.description}</p>}
      {co.skillsTaught.length > 0 && (
        <div>
          <h2 className="font-semibold text-slate">{t("courses.skillsTaught")}</h2>
          <ul className="list-disc pl-5 text-sm text-slate">
            {co.skillsTaught.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {co.prerequisites && (
        <p className="text-sm text-slate">
          <span className="font-semibold">{t("courses.prerequisites")}:</span> {co.prerequisites}
        </p>
      )}
      {co.coursePageUrl && (
        <a
          href={co.coursePageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded bg-slate px-4 py-2 text-cream"
        >
          {t("courses.viewCoursePage")} ↗
        </a>
      )}
    </div>
  );
}
