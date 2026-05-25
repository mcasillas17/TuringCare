import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { type JournalEntry, useUpdateEntry } from "@/lib/journal";
import { useState } from "react";
import { toast } from "sonner";

const input = "w-full rounded border border-silver bg-white px-3 py-2 text-sm text-slate";

type Props = {
  entry: JournalEntry;
  dogId: string;
  onDone: () => void;
};

export function PostSaveFollowUps({ entry, dogId, onDone }: Props) {
  const { t } = useI18n();
  const upd = useUpdateEntry(dogId);
  const [antecedent, setAntecedent] = useState("");

  if (entry.kind !== "moment") return null;

  const answer = async () => {
    const trimmed = antecedent.trim();
    if (!trimmed) return;
    try {
      await upd.mutateAsync({ entryId: entry.id, body: { antecedent: trimmed } });
      toast.success(t("journal.savedEdit"));
      onDone();
    } catch {
      toast.error(t("journal.saveFailed"));
    }
  };

  return (
    <section className="space-y-3 rounded border border-silver bg-white p-4">
      <h2 className="font-semibold text-slate">{t("journal.postSaveTitle")}</h2>
      <label className="block" htmlFor="post-save-antecedent">
        <span className="text-sm font-medium text-slate">{t("journal.postSaveAntecedent")}</span>
        <textarea
          id="post-save-antecedent"
          className={input}
          rows={2}
          value={antecedent}
          onChange={(event) => setAntecedent(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={upd.isPending || !antecedent.trim()}
          onClick={() => void answer()}
        >
          {t("journal.postSaveAnswer")}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("journal.postSaveSkip")}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("journal.postSaveDone")}
        </Button>
      </div>
    </section>
  );
}
