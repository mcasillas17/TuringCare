import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import { type CourseInput, courseAgeGroups, courseFormats } from "@turingcare/shared";
import { type FormEvent, useState } from "react";
import {
  type Course,
  useAdminCourses,
  useCreateCourse,
  useDeleteCourse,
  useUpdateCourse,
} from "./use-courses";

type FormState = {
  organizationName: string;
  city: string;
  state: string;
  name: string;
  description: string;
  format: (typeof courseFormats)[number];
  ageGroup: (typeof courseAgeGroups)[number];
  ageRange: string;
  durationWeeks: string;
  sessionMinutes: string;
  prerequisites: string;
  skillsTaught: string;
  isOnline: boolean;
  coursePageUrl: string;
};

const EMPTY: FormState = {
  organizationName: "",
  city: "",
  state: "",
  name: "",
  description: "",
  format: "group",
  ageGroup: "any",
  ageRange: "",
  durationWeeks: "",
  sessionMinutes: "",
  prerequisites: "",
  skillsTaught: "",
  isOnline: false,
  coursePageUrl: "",
};

const FORMAT_LABEL_KEYS = {
  group: "courses.formatGroup",
  workshop: "courses.formatWorkshop",
  seminar: "courses.formatSeminar",
  private: "courses.formatPrivate",
  drop_in: "courses.formatDropIn",
} satisfies Record<(typeof courseFormats)[number], MessageKey>;

const AGE_GROUP_LABEL_KEYS = {
  puppy: "courses.agePuppy",
  adolescent: "courses.ageAdolescent",
  adult: "courses.ageAdult",
  any: "courses.ageAny",
} satisfies Record<(typeof courseAgeGroups)[number], MessageKey>;

/** Split a comma-separated input into a trimmed, non-empty string array. */
function parseList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse a numeric input into a positive integer or null when blank/invalid. */
function parseNum(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Map an editable form into the shared CourseInput shape. */
function toInput(form: FormState): CourseInput {
  const trim = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    organizationName: form.organizationName.trim(),
    city: form.city.trim(),
    state: form.state.trim(),
    name: form.name.trim(),
    description: trim(form.description),
    format: form.format,
    ageGroup: form.ageGroup,
    ageRange: trim(form.ageRange),
    durationWeeks: parseNum(form.durationWeeks),
    sessionMinutes: parseNum(form.sessionMinutes),
    prerequisites: trim(form.prerequisites),
    skillsTaught: parseList(form.skillsTaught),
    isOnline: form.isOnline,
    coursePageUrl: trim(form.coursePageUrl),
  };
}

function fromCourse(c: Course): FormState {
  return {
    organizationName: c.organizationName,
    city: c.city,
    state: c.state,
    name: c.name,
    description: c.description ?? "",
    format: (courseFormats as readonly string[]).includes(c.format)
      ? (c.format as (typeof courseFormats)[number])
      : "group",
    ageGroup: (courseAgeGroups as readonly string[]).includes(c.ageGroup)
      ? (c.ageGroup as (typeof courseAgeGroups)[number])
      : "any",
    ageRange: c.ageRange ?? "",
    durationWeeks: c.durationWeeks?.toString() ?? "",
    sessionMinutes: c.sessionMinutes?.toString() ?? "",
    prerequisites: c.prerequisites ?? "",
    skillsTaught: c.skillsTaught.join(", "),
    isOnline: c.isOnline,
    coursePageUrl: c.coursePageUrl ?? "",
  };
}

export function AdminCourses() {
  const { t } = useI18n();
  const list = useAdminCourses();
  const create = useCreateCourse();
  const update = useUpdateCourse();
  const remove = useDeleteCourse();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const input = toInput(form);
    if (editingId) {
      update.mutate({ id: editingId, input }, { onSuccess: resetForm });
    } else {
      create.mutate(input, { onSuccess: resetForm });
    }
  }

  function startEdit(c: Course) {
    setEditingId(c.id);
    setForm(fromCourse(c));
  }

  const pending = create.isPending || update.isPending;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold text-slate">{t("admin.coursesTitle")}</h1>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-silver bg-white p-4">
        <h2 className="font-semibold">
          {editingId ? t("admin.editCourseTitle") : t("admin.addCourseTitle")}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            id="organizationName"
            label={t("admin.organization")}
            value={form.organizationName}
            onChange={set("organizationName")}
            required
          />
          <Field
            id="name"
            label={t("admin.name")}
            value={form.name}
            onChange={set("name")}
            required
          />
          <Field
            id="city"
            label={t("admin.city")}
            value={form.city}
            onChange={set("city")}
            required
          />
          <Field
            id="state"
            label={t("admin.state")}
            value={form.state}
            onChange={set("state")}
            required
          />
          <div className="space-y-1">
            <Label htmlFor="format">{t("admin.format")}</Label>
            <select
              id="format"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={form.format}
              onChange={set("format")}
            >
              {courseFormats.map((f) => (
                <option key={f} value={f}>
                  {t(FORMAT_LABEL_KEYS[f])}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ageGroup">{t("admin.ageGroup")}</Label>
            <select
              id="ageGroup"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={form.ageGroup}
              onChange={set("ageGroup")}
            >
              {courseAgeGroups.map((a) => (
                <option key={a} value={a}>
                  {t(AGE_GROUP_LABEL_KEYS[a])}
                </option>
              ))}
            </select>
          </div>
          <Field
            id="ageRange"
            label={t("admin.ageRange")}
            value={form.ageRange}
            onChange={set("ageRange")}
          />
          <Field
            id="durationWeeks"
            label={t("admin.durationWeeks")}
            type="number"
            value={form.durationWeeks}
            onChange={set("durationWeeks")}
          />
          <Field
            id="sessionMinutes"
            label={t("admin.sessionMinutes")}
            type="number"
            value={form.sessionMinutes}
            onChange={set("sessionMinutes")}
          />
          <Field
            id="prerequisites"
            label={t("admin.prerequisites")}
            value={form.prerequisites}
            onChange={set("prerequisites")}
          />
          <Field
            id="skillsTaught"
            label={t("admin.skillsTaught")}
            value={form.skillsTaught}
            onChange={set("skillsTaught")}
          />
          <Field
            id="description"
            label={t("admin.description")}
            value={form.description}
            onChange={set("description")}
          />
          <Field
            id="coursePageUrl"
            label={t("admin.coursePageUrl")}
            value={form.coursePageUrl}
            onChange={set("coursePageUrl")}
          />
          <div className="flex items-center gap-2">
            <input
              id="isOnline"
              type="checkbox"
              checked={form.isOnline}
              onChange={(e) => setForm((f) => ({ ...f, isOnline: e.target.checked }))}
            />
            <Label htmlFor="isOnline">{t("admin.online")}</Label>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {editingId ? t("admin.saveChanges") : t("admin.addCourse")}
          </Button>
          {editingId ? (
            <Button type="button" variant="outline" onClick={resetForm}>
              {t("admin.cancel")}
            </Button>
          ) : null}
        </div>
        {create.isError || update.isError ? (
          <p className="text-sm text-red-600">{t("admin.couldNotSaveCourse")}</p>
        ) : null}
      </form>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("admin.coursesTitle")}</h2>
        {list.isPending ? (
          <p className="text-slate-soft">{t("admin.loadingCourses")}</p>
        ) : list.isError ? (
          <p className="text-red-600">{t("admin.coursesLoadFailed")}</p>
        ) : list.data && list.data.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-silver bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-silver text-left text-xs uppercase tracking-wide text-slate-soft">
                  <th className="px-3 py-2 font-medium">{t("admin.name")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin.organization")}</th>
                  <th className="px-3 py-2 font-medium">{t("admin.location")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("admin.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {list.data.map((c) => (
                  <tr key={c.id} className="border-b border-silver/60 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate">{c.name}</td>
                    <td className="px-3 py-2 text-slate-soft">{c.organizationName}</td>
                    <td className="px-3 py-2 text-slate-soft">
                      {c.city}, {c.state}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(c)}
                        >
                          {t("admin.edit")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(c.id)}
                        >
                          {t("admin.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-soft">{t("admin.coursesEmpty")}</p>
        )}
      </section>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={onChange} required={required} />
    </div>
  );
}
