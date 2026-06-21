import { DailyCheckInComposer } from "@/components/journal/daily-check-in-composer";
import { EntryCard } from "@/components/journal/entry-card";
import { QuickMomentComposer } from "@/components/journal/quick-moment-composer";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useI18n } from "@/i18n";
import { useDogs } from "@/lib/dogs";
import { type JournalEntry, useJournal } from "@/lib/journal";
import { dateLabel, groupByDay } from "@/lib/when";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

type Mode = "moment" | "daily_checkin";

type JournalViewProps = { scopedDogId?: string; composeMode?: Mode };

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

export function JournalView({ scopedDogId, composeMode }: JournalViewProps) {
  const { t, locale } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const filterDogId = scopedDogId ?? searchParams.get("dogId") ?? "";
  const { data: dogs } = useDogs();
  const dogList = useMemo(() => dogs ?? [], [dogs]);
  const { data: entries, isError } = useJournal(filterDogId || undefined);
  const [selectedDogId, setSelectedDogId] = useState(filterDogId);
  const [sheet, setSheet] = useState<Mode | null>(composeMode ?? null);

  const dogNameById = useMemo(
    () => new Map(dogList.map((d) => [d.id, d.name] as const)),
    [dogList],
  );

  useEffect(() => {
    setSelectedDogId((current) => {
      if (filterDogId) return filterDogId;
      const onlyDog = dogList[0];
      if (!current && dogList.length === 1 && onlyDog) return onlyDog.id;
      return current;
    });
  }, [dogList, filterDogId]);

  const updateFilter = (dogId: string) => {
    const next = new URLSearchParams(searchParams);
    if (dogId) next.set("dogId", dogId);
    else next.delete("dogId");
    setSearchParams(next);
  };

  const counts = useMemo(() => {
    const list = entries ?? [];
    return {
      moments: list.filter((e) => e.kind === "moment").length,
      checkins: list.filter((e) => e.kind === "daily_checkin").length,
    };
  }, [entries]);

  const groups = useMemo(
    () => groupByDay((entries ?? []).map(normalizeEntry), (e) => e.occurredAt),
    [entries],
  );

  const dayHeading = (kind: string, sample: Date) =>
    kind === "today"
      ? t("journal.dayToday")
      : kind === "yesterday"
        ? t("journal.dayYesterday")
        : dateLabel(sample, new Date(), locale);

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
            onChange={(e) => updateFilter(e.target.value)}
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

      {(counts.moments > 0 || counts.checkins > 0) && (
        <p className="text-sm text-slate-soft">
          {t("journal.summaryCount", { moments: counts.moments, checkins: counts.checkins })}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          aria-label={t("dogHub.logAMoment")}
          onClick={() => setSheet("moment")}
          className="flex items-center gap-3 rounded-xl bg-slate p-4 text-left font-semibold text-cream"
        >
          ＋ {t("journal.logMoment")}
        </button>
        <button
          type="button"
          onClick={() => setSheet("daily_checkin")}
          className="flex items-center gap-3 rounded-xl border border-silver bg-white p-4 text-left font-semibold text-slate"
        >
          📋 {t("journal.dailyCheckIn")}
        </button>
      </div>

      <Sheet
        open={sheet === "moment"}
        title={t("journal.logMoment")}
        closeLabel={t("journal.closeSheet")}
        onClose={() => setSheet(null)}
      >
        <QuickMomentComposer
          dogs={dogList}
          selectedDogId={selectedDogId}
          onDogChange={setSelectedDogId}
          autoFocus
          onSaved={() => setSheet(null)}
        />
      </Sheet>
      <Sheet
        open={sheet === "daily_checkin"}
        title={t("journal.dailyCheckIn")}
        closeLabel={t("journal.closeSheet")}
        onClose={() => setSheet(null)}
      >
        <DailyCheckInComposer
          dogs={dogList}
          selectedDogId={selectedDogId}
          onDogChange={setSelectedDogId}
          autoFocus
          onSaved={() => setSheet(null)}
        />
      </Sheet>

      {isError && <p className="text-red-600">{t("journal.loadError")}</p>}
      {entries?.length === 0 && (
        <section className="space-y-2 rounded-xl border border-silver bg-white p-6 text-center">
          <h2 className="text-lg font-semibold text-slate">{t("journal.emptyTitle")}</h2>
          <p className="text-slate-soft">{t("journal.emptyBody")}</p>
        </section>
      )}

      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-soft">
              {dayHeading(group.kind, group.sample)}
            </h3>
            <ul className="space-y-2">
              {group.items.map((entry) => {
                const withDog: JournalEntry = {
                  ...entry,
                  dog: entry.dog ?? { id: entry.dogId, name: dogNameById.get(entry.dogId) ?? "" },
                };
                return <EntryCard key={entry.id} entry={withDog} dogId={entry.dogId} />;
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
