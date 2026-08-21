import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { DIMENSION_CONFIG, OUTCOME_KEYS, SAFETY_SIGNAL_KEYS } from "@/lib/practice-options";
import {
  type PracticeDimension,
  type PracticeEvidenceInput,
  type PracticeOutcome,
  type SafetySignalType,
  practiceOutcomeValues,
  safetySignalValues,
} from "@turingcare/shared";
import { useEffect, useId, useState } from "react";

export function OutcomeQuickCapture({
  onSave,
  onSkip,
  hasFallback,
  dimensions,
  currentLevel,
  usesAuditedSuggestion,
  saving = false,
}: {
  onSave: (input: PracticeEvidenceInput & { variant: "primary" | "fallback" }) => void;
  onSkip: () => void;
  hasFallback: boolean;
  dimensions: PracticeDimension[];
  currentLevel: number;
  usesAuditedSuggestion: boolean;
  saving?: boolean;
}) {
  const { t } = useI18n();
  const confirmationHelpId = useId();
  const [outcome, setOutcome] = useState<PracticeOutcome | null>(null);
  const [safetySignal, setSafetySignal] = useState<"" | SafetySignalType>("");
  const [safetyConfirmed, setSafetyConfirmed] = useState(false);
  const [currentLevelConfirmed, setCurrentLevelConfirmed] = useState(false);
  const [variant, setVariant] = useState<"primary" | "fallback">("primary");
  const [context, setContext] = useState<PracticeEvidenceInput>({});
  const hasStructuredEvidence = Boolean(
    outcome || dimensions.some((dimension) => Boolean(context[DIMENSION_CONFIG[dimension].field])),
  );

  useEffect(() => {
    if (!hasStructuredEvidence || usesAuditedSuggestion) {
      setCurrentLevelConfirmed(false);
    }
  }, [hasStructuredEvidence, usesAuditedSuggestion]);

  const handleSkip = () => {
    setOutcome(null);
    setSafetySignal("");
    setSafetyConfirmed(false);
    setCurrentLevelConfirmed(false);
    setVariant("primary");
    setContext({});
    onSkip();
  };

  return (
    <section
      aria-live="polite"
      aria-label={t("practice.outcomeQuestion")}
      className="flex flex-wrap items-center gap-2 rounded border border-silver bg-white p-3"
    >
      <span className="text-sm text-slate">{t("practice.outcomeQuestion")}</span>
      {practiceOutcomeValues.map((value) => (
        <Button
          key={value}
          type="button"
          variant={outcome === value ? "default" : "outline"}
          aria-pressed={outcome === value}
          onClick={() => setOutcome(value)}
        >
          {t(OUTCOME_KEYS[value])}
        </Button>
      ))}
      {hasFallback && (
        <fieldset>
          <legend>{t("practice.practicedVersion")}</legend>
          <label>
            <input
              type="radio"
              name="practiced-variant"
              checked={variant === "primary"}
              onChange={() => setVariant("primary")}
            />
            {t("practice.practicedPrimary")}
          </label>
          <label>
            <input
              type="radio"
              name="practiced-variant"
              checked={variant === "fallback"}
              onChange={() => setVariant("fallback")}
            />
            {t("practice.practicedFallback")}
          </label>
        </fieldset>
      )}
      {dimensions.map((dimension) => {
        const group = DIMENSION_CONFIG[dimension];
        return (
          <label key={dimension} className="text-sm text-slate">
            {t(group.labelKey)}
            <select
              aria-label={t(group.labelKey)}
              value={String(context[group.field] ?? "")}
              onChange={(event) =>
                setContext((current) => ({
                  ...current,
                  [group.field]: event.target.value || undefined,
                }))
              }
            >
              <option value="">{t("practice.contextOptional")}</option>
              {group.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
        );
      })}
      <label className="text-sm text-slate">
        {t("practice.safetyLabel")}
        <select
          aria-label={t("practice.safetyLabel")}
          value={safetySignal}
          onChange={(event) => {
            setSafetySignal(event.target.value as "" | SafetySignalType);
            setSafetyConfirmed(false);
          }}
        >
          <option value="">{t("practice.safetyNone")}</option>
          {safetySignalValues.map((value) => (
            <option key={value} value={value}>
              {t(SAFETY_SIGNAL_KEYS[value])}
            </option>
          ))}
        </select>
      </label>
      {safetySignal && (
        <label className="text-sm text-slate">
          <input
            type="checkbox"
            checked={safetyConfirmed}
            onChange={(event) => setSafetyConfirmed(event.target.checked)}
          />
          {t("practice.safetyConfirm")}
        </label>
      )}
      {hasStructuredEvidence && !usesAuditedSuggestion && (
        <label className="text-sm text-slate">
          <input
            type="checkbox"
            className="mr-2 size-4 accent-copper"
            aria-label={t("contextProgress.confirmCurrentLevel", { level: currentLevel })}
            aria-describedby={confirmationHelpId}
            checked={currentLevelConfirmed}
            onChange={(event) => setCurrentLevelConfirmed(event.target.checked)}
          />
          <span>{t("contextProgress.confirmCurrentLevel", { level: currentLevel })}</span>
          <span id={confirmationHelpId} className="ml-6 block text-xs text-slate-soft">
            {t("contextProgress.confirmCurrentLevelHelp")}
          </span>
        </label>
      )}
      <Button
        type="button"
        disabled={
          saving ||
          (!outcome && !safetySignal) ||
          Boolean(safetySignal && !safetyConfirmed) ||
          Boolean(hasStructuredEvidence && !usesAuditedSuggestion && !currentLevelConfirmed)
        }
        onClick={() =>
          onSave({
            ...context,
            outcome: outcome ?? undefined,
            safetySignal: safetySignal || undefined,
            ...(!usesAuditedSuggestion && currentLevelConfirmed
              ? { confirmCurrentLevel: true }
              : {}),
            variant,
          })
        }
      >
        {t("practice.saveEvidence")}
      </Button>
      <Button type="button" variant="outline" onClick={handleSkip}>
        {t("practice.outcomeSkip")}
      </Button>
    </section>
  );
}
