import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import type { AdvancementDecision, AdvancementProposalDto } from "@turingcare/shared";

const DECISIONS: { decision: AdvancementDecision; labelKey: MessageKey }[] = [
  { decision: "confirmed", labelKey: "suggestion.advConfirm" },
  { decision: "stayed", labelKey: "suggestion.advStayed" },
  { decision: "rejected", labelKey: "suggestion.advRejected" },
  { decision: "regressed", labelKey: "suggestion.advRegressed" },
  { decision: "insufficient_evidence", labelKey: "suggestion.advInsufficient" },
];

export function AdvancementProposalCard({
  proposal,
  skillName,
  onDecision,
}: {
  proposal: AdvancementProposalDto;
  skillName: string;
  onDecision: (proposalId: string, decision: AdvancementDecision) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <section className="space-y-2 rounded border border-silver bg-white p-4">
      <h3 className="font-semibold text-slate">{t("suggestion.advTitle")}</h3>
      <p className="text-sm text-slate">
        {t("suggestion.advBody", {
          skill: skillName,
          from: proposal.fromLevel,
          to: proposal.toLevel,
        })}
      </p>
      <p className="text-xs text-slate-soft">
        {t("suggestion.advEvidence", {
          sessions: proposal.sessionCount,
          days: proposal.dayCount,
        })}
      </p>
      <ul className="text-xs text-slate-soft">
        {proposal.supportingSessions.map((session) => (
          <li key={session.id}>
            {new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
              new Date(`${session.practiceDay}T12:00:00`),
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {DECISIONS.map((entry) => (
          <Button
            key={entry.decision}
            type="button"
            variant={entry.decision === "confirmed" ? "default" : "outline"}
            onClick={() => onDecision(proposal.id, entry.decision)}
          >
            {t(entry.labelKey)}
          </Button>
        ))}
      </div>
    </section>
  );
}
