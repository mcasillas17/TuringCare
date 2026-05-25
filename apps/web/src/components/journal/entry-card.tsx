import { StructuredDetailsEditor } from "@/components/journal/structured-details-editor";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type JournalEntry, useDeleteEntry, useUpdateEntry } from "@/lib/journal";
import { useState } from "react";
import { toast } from "sonner";

const fmt = (value: string | number | null | undefined) =>
  value == null || value === "" ? "—" : String(value);

function hasValue(value: string | number | null | undefined) {
  return value != null && value !== "";
}

export function EntryCard({ entry, dogId }: { entry: JournalEntry; dogId: string }) {
  const { t } = useI18n();
  const [mode, setMode] = useState<"collapsed" | "expanded" | "editing">("collapsed");
  const del = useDeleteEntry(dogId);
  const upd = useUpdateEntry(dogId);

  const displayEntry = upd.data ?? entry;
  const occurredText = String(displayEntry.occurredAt).slice(0, 16).replace("T", " ");
  const toggleLabel = mode === "collapsed" ? t("journal.expand") : t("journal.collapse");
  const kindLabel =
    displayEntry.kind === "daily_checkin" ? t("journal.kindDailyCheckIn") : t("journal.kindMoment");
  const trendLabel = {
    better: t("journal.trendBetter"),
    same: t("journal.trendSame"),
    harder: t("journal.trendHarder"),
  };
  const metadata = [
    displayEntry.dog?.name,
    occurredText,
    kindLabel,
    displayEntry.intensity ? `${t("journal.intensity")}: ${displayEntry.intensity}` : null,
    displayEntry.trend ? trendLabel[displayEntry.trend] : null,
  ].filter(Boolean);

  const detailRows = [
    [t("journal.antecedent"), displayEntry.antecedent],
    [t("journal.behavior"), displayEntry.behavior],
    [t("journal.consequence"), displayEntry.consequence],
    [t("journal.location"), displayEntry.location],
    [t("journal.duration"), displayEntry.durationSeconds],
    [t("journal.recovery"), displayEntry.recoverySeconds],
    [t("journal.peoplePresent"), displayEntry.peoplePresent],
    [t("journal.ownerResponse"), displayEntry.ownerResponse],
    [t("journal.notes"), displayEntry.notes],
  ].filter(([, value]) => hasValue(value as string | number | null | undefined));

  return (
    <li className="rounded border border-silver bg-white text-sm">
      <div className="flex w-full items-start justify-between gap-2 p-3">
        <button
          type="button"
          aria-label={toggleLabel}
          className="flex-1 cursor-pointer text-left"
          onClick={() => setMode(mode === "collapsed" ? "expanded" : "collapsed")}
        >
          <p className="font-medium text-slate">{displayEntry.note}</p>
          <span className="text-slate-soft block">{metadata.join(" · ")}</span>
        </button>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={() => del.mutate(displayEntry.id)}
        >
          {t("journal.remove")}
        </Button>
      </div>

      {mode === "expanded" && (
        <div className="space-y-3 border-t border-silver p-3">
          {detailRows.length > 0 ? (
            <dl className="grid gap-2 text-slate-soft sm:grid-cols-[max-content_1fr]">
              {detailRows.map(([label, value]) => (
                <div key={String(label)} className="contents">
                  <dt className="font-medium text-slate">{label}</dt>
                  <dd>{fmt(value as string | number | null | undefined)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-slate-soft">{t("journal.detailsEmpty")}</p>
          )}
          <Button type="button" variant="outline" onClick={() => setMode("editing")}>
            {t("journal.editDetails")}
          </Button>
        </div>
      )}

      {mode === "editing" && (
        <StructuredDetailsEditor
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
