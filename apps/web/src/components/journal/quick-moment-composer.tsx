import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type JournalEntry, useAddEntry } from "@/lib/journal";
import { toLocalInputValue } from "@/lib/when";
import { useState } from "react";
import { toast } from "sonner";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

type DogOption = { id: string; name: string };

type Props = {
  dogs: DogOption[];
  selectedDogId: string;
  onDogChange: (dogId: string) => void;
  onSaved: (entry: JournalEntry) => void;
  /** Focus the note on mount (when shown inside a sheet). */
  autoFocus?: boolean;
};

export function QuickMomentComposer({
  dogs,
  selectedDogId,
  onDogChange,
  onSaved,
  autoFocus,
}: Props) {
  const { t } = useI18n();
  const add = useAddEntry(selectedDogId);
  const [note, setNote] = useState("");
  const [intensity, setIntensity] = useState<number | null>(null);
  const [customTime, setCustomTime] = useState<string | null>(null);
  const [showTime, setShowTime] = useState(false);
  const [place, setPlace] = useState("");
  const [showPlace, setShowPlace] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [antecedent, setAntecedent] = useState("");
  const [behavior, setBehavior] = useState("");
  const [consequence, setConsequence] = useState("");
  const [ownerResponse, setOwnerResponse] = useState("");

  const save = async () => {
    const trimmed = note.trim();
    if (!selectedDogId) return toast.error(t("journal.dogRequired"));
    if (!trimmed) return toast.error(t("journal.noteRequired"));
    try {
      const entry = await add.mutateAsync({
        kind: "moment",
        note: trimmed,
        intensity: intensity ?? undefined,
        occurredAt: customTime ? new Date(customTime).toISOString() : undefined,
        location: place.trim() || undefined,
        antecedent: antecedent.trim() || undefined,
        behavior: behavior.trim() || undefined,
        consequence: consequence.trim() || undefined,
        ownerResponse: ownerResponse.trim() || undefined,
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
        <label className="block" htmlFor="quick-moment-dog">
          <span className="text-sm font-medium text-slate">{t("journal.pickDog")}</span>
          <select
            id="quick-moment-dog"
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

      <label className="block" htmlFor="quick-moment-note">
        <span className="text-sm font-medium text-slate">{t("journal.quickNote")}</span>
        <textarea
          id="quick-moment-note"
          // biome-ignore lint/a11y/noAutofocus: intentional focus when opened in a sheet
          autoFocus={autoFocus}
          className={input}
          rows={3}
          placeholder={t("journal.quickNotePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      <div className="space-y-1">
        <span className="text-sm font-medium text-slate">
          {t("journal.intensity")}{" "}
          <span className="font-normal text-slate-soft">· {t("journal.intensityHint")}</span>
        </span>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Intensity ${n}`}
              aria-pressed={intensity === n}
              onClick={() => setIntensity(intensity === n ? null : n)}
              className={`h-10 w-10 rounded-full border text-sm font-semibold ${
                intensity === n
                  ? "border-copper bg-copper/15 text-copper"
                  : "border-silver bg-white text-slate-soft"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {showTime ? (
          <input
            type="datetime-local"
            aria-label={t("journal.changeTime")}
            className="rounded border border-silver bg-white px-2 py-1 text-sm text-slate"
            value={customTime ?? toLocalInputValue(new Date())}
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
            🕐 {t("journal.timeNow")}
          </Button>
        )}
        {!showPlace && (
          <Button type="button" variant="outline" onClick={() => setShowPlace(true)}>
            + {t("journal.addPlace")}
          </Button>
        )}
      </div>

      {showPlace && (
        <label className="block" htmlFor="quick-moment-place">
          <span className="text-sm font-medium text-slate">{t("journal.location")}</span>
          <input
            id="quick-moment-place"
            className={input}
            placeholder={t("journal.placePlaceholder")}
            value={place}
            onChange={(e) => setPlace(e.target.value)}
          />
        </label>
      )}

      {!showDetail ? (
        <button
          type="button"
          className="text-sm font-medium text-copper"
          onClick={() => setShowDetail(true)}
        >
          + {t("journal.addDetail")}{" "}
          <span className="font-normal text-slate-soft">— {t("journal.detailHint")}</span>
        </button>
      ) : (
        <div className="space-y-3 rounded border border-silver bg-white p-3">
          <label className="block" htmlFor="quick-moment-antecedent">
            <span className="text-sm font-medium text-slate">{t("journal.antecedent")}</span>
            <input
              id="quick-moment-antecedent"
              className={input}
              value={antecedent}
              onChange={(e) => setAntecedent(e.target.value)}
            />
          </label>
          <label className="block" htmlFor="quick-moment-behavior">
            <span className="text-sm font-medium text-slate">{t("journal.behavior")}</span>
            <input
              id="quick-moment-behavior"
              className={input}
              value={behavior}
              onChange={(e) => setBehavior(e.target.value)}
            />
          </label>
          <label className="block" htmlFor="quick-moment-consequence">
            <span className="text-sm font-medium text-slate">{t("journal.consequence")}</span>
            <input
              id="quick-moment-consequence"
              className={input}
              value={consequence}
              onChange={(e) => setConsequence(e.target.value)}
            />
          </label>
          <label className="block" htmlFor="quick-moment-owner-response">
            <span className="text-sm font-medium text-slate">{t("journal.ownerResponse")}</span>
            <textarea
              id="quick-moment-owner-response"
              rows={2}
              className={input}
              value={ownerResponse}
              onChange={(e) => setOwnerResponse(e.target.value)}
            />
          </label>
        </div>
      )}

      <Button type="submit" disabled={add.isPending} className="w-full bg-slate text-cream">
        {add.isPending ? t("journal.saving") : t("journal.saveMoment")}
      </Button>
    </form>
  );
}
