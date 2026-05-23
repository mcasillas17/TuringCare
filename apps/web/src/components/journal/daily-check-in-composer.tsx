import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type JournalEntry, useAddEntry } from "@/lib/journal";
import type { JournalTrend } from "@turingcare/shared";
import { useState } from "react";
import { toast } from "sonner";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";
const trends: JournalTrend[] = ["better", "same", "harder"];

type DogOption = { id: string; name: string };

type Props = {
  dogs: DogOption[];
  selectedDogId: string;
  onDogChange: (dogId: string) => void;
  onSaved: (entry: JournalEntry) => void;
};

export function DailyCheckInComposer({ dogs, selectedDogId, onDogChange, onSaved }: Props) {
  const { t } = useI18n();
  const add = useAddEntry(selectedDogId);
  const [trend, setTrend] = useState<JournalTrend>("same");
  const [note, setNote] = useState("");

  const trendLabel: Record<JournalTrend, string> = {
    better: t("journal.trendBetter"),
    same: t("journal.trendSame"),
    harder: t("journal.trendHarder"),
  };

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
      const entry = await add.mutateAsync({ kind: "daily_checkin", trend, note: trimmed });
      setTrend("same");
      setNote("");
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
      <h2 className="font-semibold text-slate">{t("journal.dailyCheckIn")}</h2>
      {dogs.length > 1 && (
        <label className="block" htmlFor="daily-check-in-dog">
          <span className="text-sm font-medium text-slate">{t("journal.pickDog")}</span>
          <select
            id="daily-check-in-dog"
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
      <div className="flex flex-wrap gap-2">
        {trends.map((value) => (
          <Button
            key={value}
            type="button"
            variant={trend === value ? "default" : "outline"}
            aria-pressed={trend === value}
            onClick={() => setTrend(value)}
          >
            {trendLabel[value]}
          </Button>
        ))}
      </div>
      <label className="block" htmlFor="daily-check-in-note">
        <span className="text-sm font-medium text-slate">{t("journal.quickNote")}</span>
        <textarea
          id="daily-check-in-note"
          className={input}
          rows={3}
          placeholder={t("journal.quickNotePlaceholder")}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <Button type="submit" disabled={add.isPending} className="bg-slate text-cream">
        {add.isPending ? t("journal.saving") : t("journal.saveCheckIn")}
      </Button>
    </form>
  );
}
