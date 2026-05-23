import { DailyCheckInComposer } from "@/components/journal/daily-check-in-composer";
import { EntryCard } from "@/components/journal/entry-card";
import { PostSaveFollowUps } from "@/components/journal/post-save-follow-ups";
import { QuickMomentComposer } from "@/components/journal/quick-moment-composer";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useDogs } from "@/lib/dogs";
import { type JournalEntry, useJournal } from "@/lib/journal";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

type Mode = "moment" | "daily_checkin";

function normalizeEntry(entry: JournalEntry): JournalEntry {
  return {
    ...entry,
    occurredAt: String(entry.occurredAt),
    trend: entry.trend ?? null,
    antecedent: entry.antecedent ?? null,
    behavior: entry.behavior ?? null,
    consequence: entry.consequence ?? null,
    intensity: entry.intensity ?? null,
    location: entry.location ?? null,
    notes: entry.notes ?? null,
    durationSeconds: entry.durationSeconds ?? null,
    recoverySeconds: entry.recoverySeconds ?? null,
    peoplePresent: entry.peoplePresent ?? null,
    ownerResponse: entry.ownerResponse ?? null,
  };
}

export function Journal() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterDogId = searchParams.get("dogId") ?? "";
  const { data: dogs } = useDogs();
  const dogList = dogs ?? [];
  const { data: entries, isError } = useJournal(filterDogId || undefined);
  const [selectedDogId, setSelectedDogId] = useState(filterDogId);
  const [mode, setMode] = useState<Mode>("moment");
  const [followUpEntry, setFollowUpEntry] = useState<JournalEntry | null>(null);

  const dogNameById = useMemo(
    () => new Map(dogList.map((dog) => [dog.id, dog.name] as const)),
    [dogList],
  );

  useEffect(() => {
    if (filterDogId) {
      setSelectedDogId(filterDogId);
      return;
    }
    const onlyDog = dogList[0];
    if (!selectedDogId && dogList.length === 1 && onlyDog) {
      setSelectedDogId(onlyDog.id);
    }
  }, [dogList, filterDogId]);

  const withDogSummary = (entry: JournalEntry): JournalEntry => ({
    ...entry,
    dog: entry.dog ?? { id: entry.dogId, name: dogNameById.get(entry.dogId) ?? "" },
  });

  const updateFilter = (dogId: string) => {
    const next = new URLSearchParams(searchParams);
    if (dogId) next.set("dogId", dogId);
    else next.delete("dogId");
    setSearchParams(next);
    setFollowUpEntry(null);
  };

  if (dogs && dogs.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold text-slate">{t("journal.title")}</h1>
        <p className="text-slate-soft">{t("journal.noDogs")}</p>
        <Button asChild className="bg-slate text-cream">
          <Link to="/my/dogs/new">{t("journal.addDog")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-slate">{t("journal.title")}</h1>

      <label className="block" htmlFor="journal-filter-dog">
        <span className="text-sm font-medium text-slate">{t("journal.pickDog")}</span>
        <select
          id="journal-filter-dog"
          className={input}
          value={filterDogId}
          onChange={(event) => updateFilter(event.target.value)}
        >
          <option value="">{t("journal.filterAllDogs")}</option>
          {dogList.map((dog) => (
            <option key={dog.id} value={dog.id}>
              {dog.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={mode === "moment" ? "default" : "outline"}
          onClick={() => setMode("moment")}
        >
          {t("journal.logMoment")}
        </Button>
        <Button
          type="button"
          variant={mode === "daily_checkin" ? "default" : "outline"}
          onClick={() => {
            setMode("daily_checkin");
            setFollowUpEntry(null);
          }}
        >
          {t("journal.dailyCheckIn")}
        </Button>
      </div>

      {mode === "moment" ? (
        <QuickMomentComposer
          dogs={dogList}
          selectedDogId={selectedDogId}
          onDogChange={setSelectedDogId}
          onSaved={(entry) => setFollowUpEntry(withDogSummary(entry))}
        />
      ) : (
        <DailyCheckInComposer
          dogs={dogList}
          selectedDogId={selectedDogId}
          onDogChange={setSelectedDogId}
          onSaved={() => setFollowUpEntry(null)}
        />
      )}

      {followUpEntry && (
        <PostSaveFollowUps
          entry={followUpEntry}
          dogId={followUpEntry.dogId}
          onDone={() => setFollowUpEntry(null)}
        />
      )}

      {isError && <p className="text-red-600">{t("journal.loadError")}</p>}
      {entries?.length === 0 && <p className="text-slate-soft">{t("journal.empty")}</p>}
      <ul className="space-y-2">
        {entries?.map((entry) => {
          const normalized = normalizeEntry(entry);
          return <EntryCard key={normalized.id} entry={normalized} dogId={normalized.dogId} />;
        })}
      </ul>
    </div>
  );
}
