import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type CourseInput, courseAgeGroups, courseFormats } from "@turingcare/shared";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
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
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">TuringCare · Courses</h1>
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-sm underline">
            ← Back to dashboard
          </Link>
          <span aria-hidden="true" className="h-5 w-px bg-silver/70" />
          <LanguageToggle />
        </div>
      </header>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">{editingId ? "Edit course" : "Add a course"}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            id="organizationName"
            label="Organization"
            value={form.organizationName}
            onChange={set("organizationName")}
            required
          />
          <Field id="name" label="Name" value={form.name} onChange={set("name")} required />
          <Field id="city" label="City" value={form.city} onChange={set("city")} required />
          <Field id="state" label="State" value={form.state} onChange={set("state")} required />
          <div className="space-y-1">
            <Label htmlFor="format">Format</Label>
            <select
              id="format"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={form.format}
              onChange={set("format")}
            >
              {courseFormats.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ageGroup">Age group</Label>
            <select
              id="ageGroup"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={form.ageGroup}
              onChange={set("ageGroup")}
            >
              {courseAgeGroups.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <Field id="ageRange" label="Age range" value={form.ageRange} onChange={set("ageRange")} />
          <Field
            id="durationWeeks"
            label="Duration (weeks)"
            type="number"
            value={form.durationWeeks}
            onChange={set("durationWeeks")}
          />
          <Field
            id="sessionMinutes"
            label="Session (minutes)"
            type="number"
            value={form.sessionMinutes}
            onChange={set("sessionMinutes")}
          />
          <Field
            id="prerequisites"
            label="Prerequisites"
            value={form.prerequisites}
            onChange={set("prerequisites")}
          />
          <Field
            id="skillsTaught"
            label="Skills taught (comma-separated)"
            value={form.skillsTaught}
            onChange={set("skillsTaught")}
          />
          <Field
            id="description"
            label="Description"
            value={form.description}
            onChange={set("description")}
          />
          <Field
            id="coursePageUrl"
            label="Course page URL"
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
            <Label htmlFor="isOnline">Online</Label>
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {editingId ? "Save changes" : "Add course"}
          </Button>
          {editingId ? (
            <Button type="button" variant="outline" onClick={resetForm}>
              Cancel
            </Button>
          ) : null}
        </div>
        {create.isError || update.isError ? (
          <p className="text-sm text-destructive">Could not save the course. Try again.</p>
        ) : null}
      </form>

      <section className="space-y-2">
        <h2 className="font-semibold">Courses</h2>
        {list.isPending ? (
          <p>Loading courses…</p>
        ) : list.isError ? (
          <p className="text-destructive">Failed to load courses.</p>
        ) : list.data && list.data.length > 0 ? (
          <ul className="divide-y rounded-lg border bg-card">
            {list.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between p-3">
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[c.organizationName, `${c.city}, ${c.state}`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => startEdit(c)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(c.id)}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No courses yet. Add one above.</p>
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
