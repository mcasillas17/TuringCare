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
  const [intensity, setIntensity] = useState("");

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
        intensity: intensity ? Number(intensity) : undefined,
      });
      setNote("");
      setIntensity("");
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
      <label className="block" htmlFor="quick-moment-intensity">
        <span className="text-sm font-medium text-slate">{t("journal.optionalIntensity")}</span>
        <select
          id="quick-moment-intensity"
          className={input}
          value={intensity}
          onChange={(event) => setIntensity(event.target.value)}
        >
          <option value="">{t("journal.noIntensity")}</option>
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={add.isPending} className="bg-slate text-cream">
        {add.isPending ? t("journal.saving") : t("journal.saveMoment")}
      </Button>
    </form>
  );
}
