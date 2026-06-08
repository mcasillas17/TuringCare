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

type JournalViewProps = {
  scopedDogId?: string;
  composeMode?: Mode;
};

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

export function JournalView({ scopedDogId, composeMode = "moment" }: JournalViewProps) {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  // When scopedDogId is set, the filter is the scoped id; otherwise it's the URL param.
  const filterDogId = scopedDogId ?? searchParams.get("dogId") ?? "";
  const { data: dogs } = useDogs();
  const dogList = useMemo(() => dogs ?? [], [dogs]);
  const { data: entries, isError } = useJournal(filterDogId || undefined);
  const [selectedDogId, setSelectedDogId] = useState(filterDogId);
  const [mode, setMode] = useState<Mode>(composeMode);
  const [followUpEntry, setFollowUpEntry] = useState<JournalEntry | null>(null);

  const dogNameById = useMemo(
    () => new Map(dogList.map((dog) => [dog.id, dog.name] as const)),
    [dogList],
  );

  useEffect(() => {
    setSelectedDogId((currentDogId) => {
      if (filterDogId) return filterDogId;
      const onlyDog = dogList[0];
      if (!currentDogId && dogList.length === 1 && onlyDog) return onlyDog.id;
      return currentDogId;
    });
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
      <div className="space-y-4">
        <p className="text-slate-soft">{t("journal.noDogs")}</p>
        <Button asChild className="bg-slate text-cream">
          <Link to="/my/dogs/new">{t("journal.addDog")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {!scopedDogId && (
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
      )}

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
      {entries?.length === 0 && (
        <section className="space-y-2 rounded border border-silver bg-white p-6 text-center">
          <h2 className="text-lg font-semibold text-slate">{t("journal.emptyTitle")}</h2>
          <p className="text-slate-soft">{t("journal.emptyBody")}</p>
        </section>
      )}
      <ul className="space-y-2">
        {entries?.map((entry) => {
          const normalized = normalizeEntry(entry);
          return <EntryCard key={normalized.id} entry={normalized} dogId={normalized.dogId} />;
        })}
      </ul>
    </div>
  );
}
