import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { JournalEntry } from "@/lib/journal";
import { zodResolver } from "@hookform/resolvers/zod";
import { type JournalEntryUpdateInput, journalEntryUpdateSchema } from "@turingcare/shared";
import { useForm } from "react-hook-form";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

function emptyToNull(value: unknown) {
  return value === "" || value == null ? null : value;
}

function numberOrNull(value: unknown) {
  if (value === "" || value == null) return null;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
}

type Props = {
  entry: JournalEntry;
  submitting: boolean;
  onSave: (body: JournalEntryUpdateInput) => void | Promise<void>;
  onCancel: () => void;
};

export function StructuredDetailsEditor({ entry, submitting, onSave, onCancel }: Props) {
  const { t } = useI18n();
  const isDailyCheckIn = entry.kind === "daily_checkin";
  const defaultValues: JournalEntryUpdateInput = isDailyCheckIn
    ? {
        kind: entry.kind,
        note: entry.note,
        occurredAt: String(entry.occurredAt).slice(0, 16),
        trend: entry.trend ?? "same",
      }
    : {
        kind: entry.kind,
        note: entry.note,
        occurredAt: String(entry.occurredAt).slice(0, 16),
        trend: entry.trend ?? null,
        antecedent: entry.antecedent ?? undefined,
        behavior: entry.behavior ?? undefined,
        consequence: entry.consequence ?? undefined,
        intensity: entry.intensity ?? undefined,
        location: entry.location ?? undefined,
        notes: entry.notes ?? undefined,
        durationSeconds: entry.durationSeconds ?? undefined,
        recoverySeconds: entry.recoverySeconds ?? undefined,
        peoplePresent: entry.peoplePresent ?? undefined,
        ownerResponse: entry.ownerResponse ?? undefined,
      };
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<JournalEntryUpdateInput>({
    resolver: zodResolver(journalEntryUpdateSchema),
    defaultValues,
  });

  const trendLabel = {
    better: t("journal.trendBetter"),
    same: t("journal.trendSame"),
    harder: t("journal.trendHarder"),
  };

  const fieldError = (message: unknown) =>
    message ? <span className="text-xs text-red-600">{String(message)}</span> : null;

  const optional = <span className="text-slate-soft"> ({t("journal.optional")})</span>;

  return (
    <form
      className="space-y-3 border-t border-silver p-3"
      onSubmit={(event) => {
        event.stopPropagation();
        void handleSubmit((values) => onSave(values))(event);
      }}
    >
      <label className="block" htmlFor={`journal-note-${entry.id}`}>
        <span className="text-sm font-medium text-slate">{t("journal.note")}</span>
        <textarea
          id={`journal-note-${entry.id}`}
          className={input}
          rows={3}
          {...register("note")}
        />
        {fieldError(errors.note?.message)}
      </label>
      <label className="block" htmlFor={`journal-occurred-${entry.id}`}>
        <span className="text-sm font-medium text-slate">{t("journal.occurredAt")}</span>
        <input
          id={`journal-occurred-${entry.id}`}
          type="datetime-local"
          className={input}
          {...register("occurredAt")}
        />
        {fieldError(errors.occurredAt?.message)}
      </label>

      {isDailyCheckIn ? (
        <label className="block" htmlFor={`journal-trend-${entry.id}`}>
          <span className="text-sm font-medium text-slate">{t("journal.trend")}</span>
          <select id={`journal-trend-${entry.id}`} className={input} {...register("trend")}>
            {(["better", "same", "harder"] as const).map((trend) => (
              <option key={trend} value={trend}>
                {trendLabel[trend]}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <>
          <label className="block" htmlFor={`journal-intensity-${entry.id}`}>
            <span className="text-sm font-medium text-slate">{t("journal.intensity")}</span>
            <select
              id={`journal-intensity-${entry.id}`}
              className={input}
              {...register("intensity", { setValueAs: numberOrNull })}
            >
              <option value="">{t("journal.noIntensity")}</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="block" htmlFor={`journal-antecedent-${entry.id}`}>
            <span className="text-sm font-medium text-slate">{t("journal.antecedent")}</span>
            <input
              id={`journal-antecedent-${entry.id}`}
              className={input}
              {...register("antecedent", { setValueAs: emptyToNull })}
            />
          </label>
          <label className="block" htmlFor={`journal-behavior-${entry.id}`}>
            <span className="text-sm font-medium text-slate">{t("journal.behavior")}</span>
            <input
              id={`journal-behavior-${entry.id}`}
              className={input}
              {...register("behavior", { setValueAs: emptyToNull })}
            />
          </label>
          <label className="block" htmlFor={`journal-consequence-${entry.id}`}>
            <span className="text-sm font-medium text-slate">{t("journal.consequence")}</span>
            <input
              id={`journal-consequence-${entry.id}`}
              className={input}
              {...register("consequence", { setValueAs: emptyToNull })}
            />
          </label>
          <label className="block" htmlFor={`journal-location-${entry.id}`}>
            <span className="text-sm font-medium text-slate">
              {t("journal.location")}
              {optional}
            </span>
            <input
              id={`journal-location-${entry.id}`}
              className={input}
              {...register("location", { setValueAs: emptyToNull })}
            />
          </label>
          <label className="block" htmlFor={`journal-duration-${entry.id}`}>
            <span className="text-sm font-medium text-slate">
              {t("journal.duration")}
              {optional}
            </span>
            <input
              id={`journal-duration-${entry.id}`}
              type="number"
              min={0}
              className={input}
              {...register("durationSeconds", { setValueAs: numberOrNull })}
            />
          </label>
          <label className="block" htmlFor={`journal-recovery-${entry.id}`}>
            <span className="text-sm font-medium text-slate">
              {t("journal.recovery")}
              {optional}
            </span>
            <input
              id={`journal-recovery-${entry.id}`}
              type="number"
              min={0}
              className={input}
              {...register("recoverySeconds", { setValueAs: numberOrNull })}
            />
          </label>
          <label className="block" htmlFor={`journal-people-${entry.id}`}>
            <span className="text-sm font-medium text-slate">
              {t("journal.peoplePresent")}
              {optional}
            </span>
            <input
              id={`journal-people-${entry.id}`}
              className={input}
              {...register("peoplePresent", { setValueAs: emptyToNull })}
            />
          </label>
          <label className="block" htmlFor={`journal-owner-response-${entry.id}`}>
            <span className="text-sm font-medium text-slate">
              {t("journal.ownerResponse")}
              {optional}
            </span>
            <textarea
              id={`journal-owner-response-${entry.id}`}
              className={input}
              rows={2}
              {...register("ownerResponse", { setValueAs: emptyToNull })}
            />
          </label>
          <label className="block" htmlFor={`journal-notes-${entry.id}`}>
            <span className="text-sm font-medium text-slate">
              {t("journal.notes")}
              {optional}
            </span>
            <textarea
              id={`journal-notes-${entry.id}`}
              className={input}
              rows={2}
              {...register("notes", { setValueAs: emptyToNull })}
            />
          </label>
        </>
      )}

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
