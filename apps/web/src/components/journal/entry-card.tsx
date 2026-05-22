import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDeleteEntry, useUpdateEntry } from "@/lib/journal";
import { zodResolver } from "@hookform/resolvers/zod";
import { type JournalEntryInput, journalEntrySchema } from "@turingcare/shared";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

type Entry = {
  id: string;
  occurredAt: string;
  antecedent: string;
  behavior: string;
  consequence: string;
  intensity: number;
  location: string | null;
  notes: string | null;
  durationSeconds: number | null;
  recoverySeconds: number | null;
  peoplePresent: string | null;
  ownerResponse: string | null;
};

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";
const fmt = (v: string | number | null) => (v == null || v === "" ? "—" : String(v));

export function EntryCard({ entry, dogId }: { entry: Entry; dogId: string }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"collapsed" | "expanded" | "editing">("collapsed");
  const del = useDeleteEntry(dogId);
  const upd = useUpdateEntry(dogId);

  const displayEntry: Entry = (upd.data as Entry | undefined) ?? entry;
  const occurredText = String(displayEntry.occurredAt).slice(0, 16).replace("T", " ");
  const toggleLabel = mode === "collapsed" ? t("journal.expand") : t("journal.collapse");
  const toggle = () => setMode(mode === "collapsed" ? "expanded" : "collapsed");

  return (
    <li className="rounded border border-silver bg-white text-sm">
      <div className="flex w-full items-start justify-between p-3">
        <button
          type="button"
          aria-label={toggleLabel}
          className="flex-1 cursor-pointer text-left"
          onClick={toggle}
        >
          <span className="text-slate-soft block">
            {occurredText} · {t("journal.intensity")}: {displayEntry.intensity}
          </span>
          <div>A: {displayEntry.antecedent}</div>
          <div>B: {displayEntry.behavior}</div>
          <div>C: {displayEntry.consequence}</div>
        </button>
        <Button
          variant="outline"
          className="ml-2 shrink-0"
          onClick={() => del.mutate(displayEntry.id)}
        >
          {t("journal.remove")}
        </Button>
      </div>

      {mode === "expanded" && (
        <div className="space-y-1 border-t border-silver p-3">
          <div>
            {t("journal.occurredAt")}: {occurredText}
          </div>
          <div>
            {t("journal.location")}: {fmt(displayEntry.location)}
          </div>
          <div>
            {t("journal.duration")}: {fmt(displayEntry.durationSeconds)}
          </div>
          <div>
            {t("journal.recovery")}: {fmt(displayEntry.recoverySeconds)}
          </div>
          <div>
            {t("journal.peoplePresent")}: {fmt(displayEntry.peoplePresent)}
          </div>
          <div>
            {t("journal.ownerResponse")}: {fmt(displayEntry.ownerResponse)}
          </div>
          <div>
            {t("journal.notes")}: {fmt(displayEntry.notes)}
          </div>
          <Button variant="outline" onClick={() => setMode("editing")}>
            ✎ {t("journal.edit")}
          </Button>
        </div>
      )}

      {mode === "editing" && (
        <EditForm
          entry={displayEntry}
          submitting={upd.isPending}
          onCancel={() => setMode("expanded")}
          onSave={async (body) => {
            try {
              await upd.mutateAsync({ entryId: displayEntry.id, body });
              toast.success(t("journal.savedEdit"));
              setMode("expanded");
            } catch {
              toast.error(t("journal.saveFailed"));
            }
          }}
        />
      )}
    </li>
  );
}

function EditForm({
  entry,
  submitting,
  onSave,
  onCancel,
}: {
  entry: Entry;
  submitting: boolean;
  onSave: (body: JournalEntryInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<JournalEntryInput>({
    resolver: zodResolver(journalEntrySchema),
    defaultValues: {
      occurredAt: String(entry.occurredAt).slice(0, 16),
      antecedent: entry.antecedent,
      behavior: entry.behavior,
      consequence: entry.consequence,
      intensity: entry.intensity,
      location: entry.location ?? undefined,
      notes: entry.notes ?? undefined,
      durationSeconds: entry.durationSeconds ?? undefined,
      recoverySeconds: entry.recoverySeconds ?? undefined,
      peoplePresent: entry.peoplePresent ?? undefined,
      ownerResponse: entry.ownerResponse ?? undefined,
    },
  });

  const onSubmit = handleSubmit((v) => onSave({ ...v, intensity: Number(v.intensity) }));
  const optional = <span className="text-slate-soft"> ({t("journal.optional")})</span>;

  return (
    <form
      onSubmit={(e) => {
        e.stopPropagation();
        onSubmit();
      }}
      className="space-y-3 border-t border-silver p-3"
    >
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
        <select className={input} {...register("intensity", { valueAsNumber: true })}>
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
        <input className={input} {...register("location", { setValueAs: (v) => v || undefined })} />
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
          rows={2}
          className={input}
          {...register("notes", { setValueAs: (v) => v || undefined })}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting || submitting} className="bg-slate text-cream">
          {isSubmitting || submitting ? t("journal.saving") : t("journal.update")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("journal.cancel")}
        </Button>
      </div>
    </form>
  );
}
