import { useI18n } from "@/i18n";
import type { JournalEntry } from "@/lib/journal";
import { Link } from "react-router-dom";

type Props = {
  entries: JournalEntry[];
  seeAllHref: string;
};

export function RecentActivity({ entries, seeAllHref }: Props) {
  const { t } = useI18n();
  const top = entries.slice(0, 3);

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate">{t("dogHub.recentActivity")}</h2>
      {top.length === 0 ? (
        <p className="text-sm text-slate-soft">{t("dogHub.recentEmpty")}</p>
      ) : (
        <ul className="space-y-1 text-sm text-slate-soft">
          {top.map((entry) => {
            const summary = entry.note ?? entry.behavior ?? "";
            const date = String(entry.occurredAt).slice(0, 10);
            return (
              <li key={entry.id}>
                <span className="text-slate">{summary}</span>
                <span> · {date}</span>
              </li>
            );
          })}
        </ul>
      )}
      <Link to={seeAllHref} className="text-sm text-copper hover:underline">
        {t("dogHub.seeAllJournal")}
      </Link>
    </section>
  );
}
