import { useI18n } from "@/i18n";
import { type CourseFilters, useCourses } from "@/lib/courses";
import { useState } from "react";
import { Link } from "react-router-dom";

const input = "rounded border border-silver bg-white px-2 py-1 text-sm";

export function Courses() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<CourseFilters>({});
  const { data: courses, isError } = useCourses(filters);
  const hasFilters = !!(filters.ageGroup || filters.format || filters.state || filters.online);

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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-slate">{t("courses.title")}</h1>
      <p className="text-slate-soft">{t("courses.subtitle")}</p>
      <div className="flex flex-wrap gap-2">
        <select
          className={input}
          aria-label={t("courses.filterAgeGroup")}
          value={filters.ageGroup ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, ageGroup: e.target.value || undefined }))}
        >
          <option value="">{t("courses.filterAgeGroup")}</option>
          <option value="puppy">{t("courses.agePuppy")}</option>
          <option value="adolescent">{t("courses.ageAdolescent")}</option>
          <option value="adult">{t("courses.ageAdult")}</option>
          <option value="any">{t("courses.ageAny")}</option>
        </select>
        <select
          className={input}
          aria-label={t("courses.filterFormat")}
          value={filters.format ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, format: e.target.value || undefined }))}
        >
          <option value="">{t("courses.filterFormat")}</option>
          <option value="group">{t("courses.formatGroup")}</option>
          <option value="workshop">{t("courses.formatWorkshop")}</option>
          <option value="seminar">{t("courses.formatSeminar")}</option>
          <option value="private">{t("courses.formatPrivate")}</option>
          <option value="drop_in">{t("courses.formatDropIn")}</option>
        </select>
        <input
          className={input}
          placeholder={t("courses.filterState")}
          value={filters.state ?? ""}
          onChange={(e) => setFilters((f) => ({ ...f, state: e.target.value || undefined }))}
        />
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={!!filters.online}
            onChange={(e) => setFilters((f) => ({ ...f, online: e.target.checked || undefined }))}
          />
          {t("courses.filterOnline")}
        </label>
        <button type="button" className={input} onClick={() => setFilters({})}>
          {t("courses.clear")}
        </button>
      </div>

      {isError && <p className="text-red-600">{t("courses.loadError")}</p>}
      {courses?.length === 0 && (
        <p className="text-slate-soft">
          {hasFilters ? t("courses.emptyFiltered") : t("courses.empty")}
        </p>
      )}
      {courses && courses.length > 0 && (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-silver text-left text-slate-soft">
              <th className="py-2">{t("courses.colCourse")}</th>
              <th className="py-2">{t("courses.colAge")}</th>
              <th className="py-2">{t("courses.colFormat")}</th>
              <th className="py-2">{t("courses.colOfferedBy")}</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((co) => (
              <tr key={co.id} className="border-b border-silver hover:bg-surface-sand">
                <td className="py-2 font-medium text-slate">
                  <Link to={`/courses/${co.id}`} className="hover:underline">
                    {co.name}
                  </Link>
                </td>
                <td className="py-2 text-slate-soft">{ageLabel[co.ageGroup] ?? co.ageGroup}</td>
                <td className="py-2 text-slate-soft">{fmtLabel[co.format] ?? co.format}</td>
                <td className="py-2 text-slate-soft">
                  {co.organizationName} · {co.city}, {co.state}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
