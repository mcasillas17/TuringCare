import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/i18n";
import type { TrainerInput } from "@turingcare/shared";
import { type FormEvent, useState } from "react";
import {
  type Trainer,
  useCreateTrainer,
  useDeleteTrainer,
  useTrainers,
  useUpdateTrainer,
} from "./use-trainers";

type FormState = {
  name: string;
  businessName: string;
  city: string;
  state: string;
  methodologyTags: string;
  certifications: string;
  specialties: string;
  website: string;
  email: string;
  phone: string;
  notesInternal: string;
};

const EMPTY: FormState = {
  name: "",
  businessName: "",
  city: "",
  state: "",
  methodologyTags: "",
  certifications: "",
  specialties: "",
  website: "",
  email: "",
  phone: "",
  notesInternal: "",
};

/** Split a comma-separated input into a trimmed, non-empty string array. */
function parseList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Map an editable form into the shared TrainerInput shape. */
function toInput(form: FormState): TrainerInput {
  const trim = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    name: form.name.trim(),
    businessName: trim(form.businessName),
    city: form.city.trim(),
    state: form.state.trim(),
    methodologyTags: parseList(form.methodologyTags),
    certifications: parseList(form.certifications),
    specialties: parseList(form.specialties),
    website: trim(form.website),
    email: trim(form.email),
    phone: trim(form.phone),
    notesInternal: trim(form.notesInternal),
  };
}

function fromTrainer(t: Trainer): FormState {
  return {
    name: t.name,
    businessName: t.businessName ?? "",
    city: t.city,
    state: t.state,
    methodologyTags: t.methodologyTags.join(", "),
    certifications: t.certifications.join(", "),
    specialties: t.specialties.join(", "),
    website: t.website ?? "",
    email: t.email ?? "",
    phone: t.phone ?? "",
    notesInternal: "",
  };
}

export function AdminTrainers() {
  const { t } = useI18n();
  const list = useTrainers();
  const create = useCreateTrainer();
  const update = useUpdateTrainer();
  const remove = useDeleteTrainer();

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

  function startEdit(t: Trainer) {
    setEditingId(t.id);
    setForm(fromTrainer(t));
  }

  const pending = create.isPending || update.isPending;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold text-slate">{t("admin.trainersTitle")}</h1>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-silver bg-white p-4">
        <h2 className="font-semibold">
          {editingId ? t("admin.editTrainerTitle") : t("admin.addTrainerTitle")}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            id="name"
            label={t("admin.name")}
            value={form.name}
            onChange={set("name")}
            required
          />
          <Field
            id="businessName"
            label={t("admin.businessName")}
            value={form.businessName}
            onChange={set("businessName")}
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
          <Field
            id="methodologyTags"
            label={t("admin.methodologyTags")}
            value={form.methodologyTags}
            onChange={set("methodologyTags")}
          />
          <Field
            id="certifications"
            label={t("admin.certifications")}
            value={form.certifications}
            onChange={set("certifications")}
          />
          <Field
            id="specialties"
            label={t("admin.specialties")}
            value={form.specialties}
            onChange={set("specialties")}
          />
          <Field
            id="website"
            label={t("admin.website")}
            value={form.website}
            onChange={set("website")}
          />
          <Field
            id="email"
            label={t("admin.email")}
            type="email"
            value={form.email}
            onChange={set("email")}
          />
          <Field id="phone" label={t("admin.phone")} value={form.phone} onChange={set("phone")} />
          <Field
            id="notesInternal"
            label={t("admin.internalNotes")}
            value={form.notesInternal}
            onChange={set("notesInternal")}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {editingId ? t("admin.saveChanges") : t("admin.addTrainer")}
          </Button>
          {editingId ? (
            <Button type="button" variant="outline" onClick={resetForm}>
              {t("admin.cancel")}
            </Button>
          ) : null}
        </div>
        {create.isError || update.isError ? (
          <p className="text-sm text-red-600">{t("admin.couldNotSaveTrainer")}</p>
        ) : null}
      </form>

      <section className="space-y-2">
        <h2 className="font-semibold text-slate">{t("admin.trainersTitle")}</h2>
        {list.isPending ? (
          <p className="text-slate-soft">{t("admin.loadingTrainers")}</p>
        ) : list.isError ? (
          <p className="text-red-600">{t("admin.trainersLoadFailed")}</p>
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
                {list.data.map((trainer) => (
                  <tr key={trainer.id} className="border-b border-silver/60 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate">{trainer.name}</td>
                    <td className="px-3 py-2 text-slate-soft">{trainer.businessName ?? "—"}</td>
                    <td className="px-3 py-2 text-slate-soft">
                      {trainer.city}, {trainer.state}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => startEdit(trainer)}
                        >
                          {t("admin.edit")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(trainer.id)}
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
          <p className="text-slate-soft">{t("admin.trainersEmpty")}</p>
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
