import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type JournalEntry, useAddEntry } from "@/lib/journal";
import { toLocalInputValue } from "@/lib/when";
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
  autoFocus?: boolean;
};

export function DailyCheckInComposer({
  dogs,
  selectedDogId,
  onDogChange,
  onSaved,
  autoFocus,
}: Props) {
  const { t } = useI18n();
  const add = useAddEntry(selectedDogId);
  const [trend, setTrend] = useState<JournalTrend>("same");
  const [note, setNote] = useState("");
  const [customTime, setCustomTime] = useState<string | null>(null);
  const [showTime, setShowTime] = useState(false);

  const trendLabel: Record<JournalTrend, string> = {
    better: t("journal.trendBetter"),
    same: t("journal.trendSame"),
    harder: t("journal.trendHarder"),
  };

  const save = async () => {
    const trimmed = note.trim();
    if (!selectedDogId) return toast.error(t("journal.dogRequired"));
    if (!trimmed) return toast.error(t("journal.noteRequired"));
    try {
      const entry = await add.mutateAsync({
        kind: "daily_checkin",
        trend,
        note: trimmed,
        occurredAt: customTime ? new Date(customTime).toISOString() : undefined,
      });
      toast.success(t("journal.saved"));
      onSaved(entry);
    } catch {
      toast.error(t("journal.saveFailed"));
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {dogs.length > 1 && (
        <label className="block" htmlFor="daily-check-in-dog">
          <span className="text-sm font-medium text-slate">{t("journal.pickDog")}</span>
          <select
            id="daily-check-in-dog"
            className={input}
            value={selectedDogId}
            onChange={(e) => onDogChange(e.target.value)}
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

      <fieldset className="space-y-1" aria-label={t("journal.trend")}>
        <span className="text-sm font-medium text-slate">{t("journal.howWasToday")}</span>
        <div className="grid grid-cols-3 gap-2">
          {trends.map((value) => (
            <Button
              key={value}
              type="button"
              variant={trend === value ? "default" : "outline"}
              aria-pressed={trend === value}
              className="justify-center"
              onClick={() => setTrend(value)}
            >
              {trendLabel[value]}
            </Button>
          ))}
        </div>
      </fieldset>

      <label className="block" htmlFor="daily-check-in-note">
        <span className="text-sm font-medium text-slate">{t("journal.note")}</span>
        <textarea
          id="daily-check-in-note"
          // biome-ignore lint/a11y/noAutofocus: intentional focus when opened in a sheet
          autoFocus={autoFocus}
          className={input}
          rows={3}
          placeholder={t("journal.checkInNotePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        {showTime ? (
          <input
            type="datetime-local"
            aria-label={t("journal.changeTime")}
            className="rounded border border-silver bg-white px-2 py-1 text-sm text-slate"
            value={customTime ?? ""}
            onChange={(e) => setCustomTime(e.target.value)}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowTime(true);
              setCustomTime(toLocalInputValue(new Date()));
            }}
          >
            🕐 {t("journal.timeToday")}
          </Button>
        )}
      </div>

      <Button type="submit" disabled={add.isPending} className="w-full bg-slate text-cream">
        {add.isPending ? t("journal.saving") : t("journal.saveCheckIn")}
      </Button>
    </form>
  );
}
