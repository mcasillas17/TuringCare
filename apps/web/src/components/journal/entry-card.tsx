import { StructuredDetailsEditor } from "@/components/journal/structured-details-editor";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type JournalEntry, useDeleteEntry, useUpdateEntry } from "@/lib/journal";
import { humanTime } from "@/lib/when";
import { useState } from "react";
import { toast } from "sonner";

const trendDot: Record<string, string> = {
  better: "bg-green-400",
  same: "bg-silver",
  harder: "bg-red-400",
};

export function EntryCard({ entry, dogId }: { entry: JournalEntry; dogId: string }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const del = useDeleteEntry(dogId);
  const upd = useUpdateEntry(dogId);
  const e = upd.data ?? entry;

  const isCheckIn = e.kind === "daily_checkin";
  const dotClass = isCheckIn && e.trend ? trendDot[e.trend] : "bg-silver";
  const trendLabel = {
    better: t("journal.trendBetter"),
    same: t("journal.trendSame"),
    harder: t("journal.trendHarder"),
  };
  const meta = [
    e.dog?.name,
    humanTime(e.occurredAt, locale),
    isCheckIn ? t("journal.kindDailyCheckIn") : t("journal.kindMoment"),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <li className="rounded-xl border border-silver bg-white text-sm">
      <button
        type="button"
        aria-label={t("journal.openEntry")}
        className="flex w-full items-start gap-3 p-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate">{e.note}</span>
            {isCheckIn && e.trend && (
              <span className="rounded-full bg-slate/5 px-2 py-0.5 text-xs font-semibold text-slate-soft">
                {trendLabel[e.trend]}
              </span>
            )}
            {e.intensity != null && (
              <span className="rounded-full bg-copper/15 px-2 py-0.5 text-xs font-semibold text-copper">
                {t("journal.intensity")}: {e.intensity}
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-xs text-slate-soft">{meta}</span>
        </span>
      </button>

      {open && !editing && (
        <div className="flex gap-2 border-t border-silver p-3">
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            {t("journal.editDetails")}
          </Button>
          <Button type="button" variant="outline" onClick={() => del.mutate(e.id)}>
            {t("journal.remove")}
          </Button>
        </div>
      )}

      {open && editing && (
        <StructuredDetailsEditor
          entry={e}
          submitting={upd.isPending}
          onCancel={() => setEditing(false)}
          onSave={async (body) => {
            try {
              await upd.mutateAsync({ entryId: e.id, body });
              toast.success(t("journal.savedEdit"));
              setEditing(false);
            } catch {
              toast.error(t("journal.saveFailed"));
            }
          }}
        />
      )}
    </li>
  );
}
