import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type JournalEntry, useAddEntry } from "@/lib/journal";
import { useState } from "react";
import { toast } from "sonner";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

type DogOption = { id: string; name: string };

type Props = {
  dogs: DogOption[];
  selectedDogId: string;
  onDogChange: (dogId: string) => void;
  onSaved: (entry: JournalEntry) => void;
};

export function QuickMomentComposer({ dogs, selectedDogId, onDogChange, onSaved }: Props) {
  const { t } = useI18n();
  const add = useAddEntry(selectedDogId);
  const [note, setNote] = useState("");
  const [intensity, setIntensity] = useState<number | null>(null);

  const save = async () => {
    const trimmed = note.trim();
    if (!selectedDogId) {
      toast.error(t("journal.dogRequired"));
      return;
    }
    if (!trimmed) {
      toast.error(t("journal.noteRequired"));
      return;
    }

    try {
      const entry = await add.mutateAsync({
        kind: "moment",
        note: trimmed,
        intensity: intensity ?? undefined,
      });
      setNote("");
      setIntensity(null);
      toast.success(t("journal.saved"));
      onSaved(entry);
    } catch {
      toast.error(t("journal.saveFailed"));
    }
  };

  return (
    <form
      className="space-y-3 rounded border border-silver bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h2 className="font-semibold text-slate">{t("journal.logMoment")}</h2>
      {dogs.length > 1 && (
        <label className="block" htmlFor="quick-moment-dog">
          <span className="text-sm font-medium text-slate">{t("journal.pickDog")}</span>
          <select
            id="quick-moment-dog"
            className={input}
            value={selectedDogId}
            onChange={(event) => onDogChange(event.target.value)}
          >
            <option value="">{t("journal.pickDog")}</option>
            {dogs.map((dog) => (
              <option key={dog.id} value={dog.id}>
                {dog.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block" htmlFor="quick-moment-note">
        <span className="text-sm font-medium text-slate">{t("journal.quickNote")}</span>
        <textarea
          id="quick-moment-note"
          className={input}
          rows={3}
          placeholder={t("journal.quickNotePlaceholder")}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="space-y-1">
        <span className="text-sm font-medium text-slate">{t("journal.optionalIntensity")}</span>
        {intensity === null ? (
          <Button
            type="button"
            variant="outline"
            className="w-full justify-center"
            onClick={() => setIntensity(3)}
          >
            + {t("journal.addIntensity")}
          </Button>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <input
                id="quick-moment-intensity"
                type="range"
                min={1}
                max={5}
                step={1}
                value={intensity}
                aria-label={t("journal.optionalIntensity")}
                aria-valuetext={String(intensity)}
                onChange={(event) => setIntensity(Number(event.target.value))}
                className="flex-1 accent-slate"
              />
              <span className="w-5 text-center text-sm font-semibold text-slate">{intensity}</span>
              <button
                type="button"
                onClick={() => setIntensity(null)}
                aria-label={t("journal.clearIntensity")}
                className="px-1 text-slate-soft hover:text-slate"
              >
                ✕
              </button>
            </div>
            <div className="flex justify-between px-1 text-xs text-slate-soft" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
          </div>
        )}
      </div>
      <Button type="submit" disabled={add.isPending} className="bg-slate text-cream">
        {add.isPending ? t("journal.saving") : t("journal.saveMoment")}
      </Button>
    </form>
  );
}
