import { EntryCard } from "@/components/journal/entry-card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDogs } from "@/lib/dogs";
import { useAddEntry, useJournal } from "@/lib/journal";
import { zodResolver } from "@hookform/resolvers/zod";
import { type JournalEntryInput, journalEntrySchema } from "@turingcare/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

export function Journal() {
  const { t } = useI18n();
  const { data: dogs } = useDogs();
  const [dogId, setDogId] = useState("");
  const selected = dogId || dogs?.[0]?.id || "";
  const { data: entries, isError } = useJournal(selected);
  const add = useAddEntry(selected);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<JournalEntryInput>({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: { intensity: 3 },
  });

  if (dogs && dogs.length === 0) return <p className="text-slate-soft">{t("journal.noDogs")}</p>;

  const onSubmit = handleSubmit(async (v) => {
    try {
      await add.mutateAsync({ ...v, intensity: Number(v.intensity) });
      toast.success(t("journal.saved"));
      reset({ intensity: 3 });
    } catch {
      toast.error(t("journal.saveFailed"));
    }
  });

  const optional = <span className="text-slate-soft"> ({t("journal.optional")})</span>;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-slate">{t("journal.title")}</h1>
      <label className="block">
        <span className="text-sm font-medium text-slate">{t("journal.pickDog")}</span>
        <select className={input} value={selected} onChange={(e) => setDogId(e.target.value)}>
          {dogs?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>

      {isError && <p className="text-red-600">{t("journal.loadError")}</p>}
      {entries?.length === 0 && <p className="text-slate-soft">{t("journal.empty")}</p>}
      <ul className="space-y-2">
        {entries?.map((e) => (
          <EntryCard
            key={e.id}
            dogId={selected}
            entry={{
              ...e,
              occurredAt: String(e.occurredAt),
              durationSeconds: e.durationSeconds ?? null,
              recoverySeconds: e.recoverySeconds ?? null,
              peoplePresent: e.peoplePresent ?? null,
              ownerResponse: e.ownerResponse ?? null,
              location: e.location ?? null,
              notes: e.notes ?? null,
            }}
          />
        ))}
      </ul>

      <form onSubmit={onSubmit} className="space-y-3 rounded border border-silver bg-white p-4">
        <h2 className="font-semibold text-slate">{t("journal.add")}</h2>
        <label className="block">
          <span className="text-sm">{t("journal.occurredAt")}</span>
          <input type="datetime-local" className={input} {...register("occurredAt")} />
          {errors.occurredAt && (
            <span className="text-xs text-red-600">{errors.occurredAt.message}</span>
          )}
        </label>
        <label className="block">
          <span className="text-sm">{t("journal.antecedent")}</span>
          <input className={input} {...register("antecedent")} />
        </label>
        <label className="block">
          <span className="text-sm">{t("journal.behavior")}</span>
          <input className={input} {...register("behavior")} />
        </label>
        <label className="block">
          <span className="text-sm">{t("journal.consequence")}</span>
          <input className={input} {...register("consequence")} />
        </label>
        <label className="block">
          <span className="text-sm">{t("journal.intensity")}</span>
          <select
            className={input}
            {...register("intensity", { valueAsNumber: true })}
            defaultValue={3}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm">
            {t("journal.location")}
            {optional}
          </span>
          <input
            className={input}
            {...register("location", { setValueAs: (v) => v || undefined })}
          />
        </label>
        <label className="block">
          <span className="text-sm">
            {t("journal.duration")}
            {optional}
          </span>
          <input
            type="number"
            min={0}
            className={input}
            {...register("durationSeconds", {
              setValueAs: (v) =>
                v === "" || v == null || Number.isNaN(Number(v)) ? undefined : Number(v),
            })}
          />
        </label>
        <label className="block">
          <span className="text-sm">
            {t("journal.recovery")}
            {optional}
          </span>
          <input
            type="number"
            min={0}
            className={input}
            {...register("recoverySeconds", {
              setValueAs: (v) =>
                v === "" || v == null || Number.isNaN(Number(v)) ? undefined : Number(v),
            })}
          />
        </label>
        <label className="block">
          <span className="text-sm">
            {t("journal.peoplePresent")}
            {optional}
          </span>
          <input
            className={input}
            {...register("peoplePresent", { setValueAs: (v) => v || undefined })}
          />
        </label>
        <label className="block">
          <span className="text-sm">
            {t("journal.ownerResponse")}
            {optional}
          </span>
          <textarea
            rows={2}
            className={input}
            {...register("ownerResponse", { setValueAs: (v) => v || undefined })}
          />
        </label>
        <label className="block">
          <span className="text-sm">
            {t("journal.notes")}
            {optional}
          </span>
          <textarea
            className={input}
            rows={2}
            {...register("notes", { setValueAs: (v) => v || undefined })}
          />
        </label>
        <Button type="submit" disabled={isSubmitting} className="bg-slate text-cream">
          {isSubmitting ? t("journal.saving") : t("journal.save")}
        </Button>
      </form>
    </div>
  );
}
