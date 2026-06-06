import { JournalView } from "@/components/journal/journal-view";
import { useI18n } from "@/i18n";

export function Journal() {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-2xl font-bold text-slate">{t("journal.title")}</h1>
      <JournalView />
    </div>
  );
}
