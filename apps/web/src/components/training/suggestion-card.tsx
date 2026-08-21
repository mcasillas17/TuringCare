import { AdvancementProposalCard } from "@/components/training/advancement-proposal-card";
import { SafetyNotice } from "@/components/training/safety-notice";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import type { MessageKey } from "@/i18n/types";
import { EASING_STRATEGY_KEYS, RULE_REASON_KEYS } from "@/lib/practice-options";
import type { AdvancementDecision, SuggestionAction, TrainingSuggestion } from "@turingcare/shared";

export type SuggestionSuppressionReason = "fetching" | "error" | "safety";

const ACTIONS: { action: SuggestionAction; labelKey: MessageKey }[] = [
  { action: "started", labelKey: "suggestion.actionStarted" },
  { action: "skipped", labelKey: "suggestion.actionSkipped" },
  { action: "rated_useful", labelKey: "suggestion.rateUseful" },
  { action: "rated_not_useful", labelKey: "suggestion.rateNotUseful" },
];

type InteractiveSuggestionCardProps = {
  mode?: "interactive";
  suggestion: TrainingSuggestion;
  onAction: (action: SuggestionAction) => void;
  onDecision: (proposalId: string, decision: AdvancementDecision) => void;
  onPickFocus: () => void;
  actionPending?: boolean;
  decisionPending?: boolean;
  suppressionReason?: SuggestionSuppressionReason;
  onRetry?: () => void;
};

type PreviewSuggestionCardProps = {
  mode: "preview";
  suggestion: TrainingSuggestion;
};

export type SuggestionCardProps = InteractiveSuggestionCardProps | PreviewSuggestionCardProps;

export function SuggestionCard(props: SuggestionCardProps) {
  const { t } = useI18n();
  const { suggestion } = props;

  if (props.mode !== "preview" && props.suppressionReason === "safety") return null;

  if (suggestion.safety) return <SafetyNotice safety={suggestion.safety} />;

  if (
    props.mode !== "preview" &&
    (props.suppressionReason === "fetching" || props.suppressionReason === "error")
  ) {
    return (
      <section
        aria-busy={props.suppressionReason === "fetching" ? true : undefined}
        className="space-y-2 rounded border border-silver bg-white p-4"
      >
        <h2 className="font-semibold text-slate">{t("suggestion.title")}</h2>
        {props.suppressionReason === "fetching" ? (
          <p className="text-sm text-slate-soft">{t("common.loading")}</p>
        ) : (
          <>
            <output className="block text-sm text-slate-soft">{t("suggestion.loadError")}</output>
            {props.onRetry && (
              <Button type="button" variant="outline" onClick={props.onRetry}>
                {t("contextProgress.retry")}
              </Button>
            )}
          </>
        )}
      </section>
    );
  }

  if (suggestion.dismissed) {
    return (
      <section className="space-y-2 rounded border border-silver bg-white p-4">
        <h2 className="font-semibold text-slate">{t("suggestion.skippedTitle")}</h2>
        <p className="text-sm text-slate-soft">{t("suggestion.skippedBody")}</p>
      </section>
    );
  }

  if (suggestion.type === "needs_focus_skill") {
    return (
      <section className="space-y-3 rounded border border-silver bg-white p-4">
        <h2 className="font-semibold text-slate">{t("suggestion.needsFocusTitle")}</h2>
        <p className="text-sm text-slate-soft">{t("suggestion.needsFocusBody")}</p>
        {props.mode !== "preview" && (
          <Button type="button" onClick={props.onPickFocus}>
            {t("suggestion.needsFocusCta")}
          </Button>
        )}
      </section>
    );
  }

  if (suggestion.type === "custom_skill_unsupported") {
    return (
      <section className="space-y-2 rounded border border-silver bg-white p-4">
        <h2 className="font-semibold text-slate">{t("suggestion.customTitle")}</h2>
        {suggestion.skill && (
          <p className="text-sm text-slate">
            {t("suggestion.forSkill", { skill: suggestion.skill.name })}
          </p>
        )}
        <p className="text-sm text-slate-soft">{t("suggestion.customBody")}</p>
      </section>
    );
  }

  const { primary, fallback, skill, ruleId } = suggestion;
  if (!primary || !fallback || !ruleId) return null;

  const fallbackHeading = t("suggestion.fallbackSameLevel");

  return (
    <section className="space-y-3 rounded border border-silver bg-white p-4">
      <div className="space-y-1">
        <h2 className="font-semibold text-slate">{t("suggestion.title")}</h2>
        {skill && (
          <p className="text-sm text-slate-soft">
            {t("suggestion.forSkill", { skill: skill.name })} ·{" "}
            {t("suggestion.levelLabel", { level: primary.level })}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase text-slate-soft">
          {t("suggestion.primaryLabel")}
        </p>
        <p className="text-sm text-slate">{primary.exercise}</p>
      </div>

      <div className="space-y-1 rounded bg-cream p-3">
        <p className="text-xs font-medium uppercase text-slate-soft">
          {t("suggestion.fallbackLabel")}
        </p>
        <p className="text-xs text-slate-soft">{fallbackHeading}</p>
        <p className="text-sm text-slate">{fallback.exercise}</p>
        {fallback.easingStrategy && (
          <p className="text-xs text-slate-soft">
            {t(EASING_STRATEGY_KEYS[fallback.easingStrategy])}
          </p>
        )}
      </div>

      <p className="text-xs text-slate-soft">
        {t(RULE_REASON_KEYS[ruleId], { level: primary.level })}
      </p>
      <p className="text-xs text-slate-soft">
        {suggestion.evidence.sessionCount === 0
          ? t("suggestion.noEvidence")
          : t("suggestion.evidence", {
              sessions: suggestion.evidence.sessionCount,
              days: suggestion.evidence.distinctDayCount,
              window: suggestion.evidence.windowDays,
            })}
      </p>

      {props.mode !== "preview" && (
        <>
          <div className="flex flex-wrap gap-2">
            {ACTIONS.map((entry) => (
              <Button
                key={entry.action}
                type="button"
                variant={entry.action === "started" ? "default" : "outline"}
                disabled={!suggestion.suggestionId || props.actionPending}
                onClick={() => props.onAction(entry.action)}
              >
                {t(entry.labelKey)}
              </Button>
            ))}
            <Button type="button" variant="outline" onClick={props.onPickFocus}>
              {t("suggestion.changeFocus")}
            </Button>
          </div>

          {suggestion.advancementProposal?.status === "proposed" && skill && (
            <AdvancementProposalCard
              proposal={suggestion.advancementProposal}
              skillName={skill.name}
              onDecision={props.onDecision}
              pending={props.decisionPending}
            />
          )}
        </>
      )}
    </section>
  );
}
