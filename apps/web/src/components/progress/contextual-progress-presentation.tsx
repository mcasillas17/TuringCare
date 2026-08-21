import type { useI18n } from "@/i18n";
import { DIMENSION_CONFIG } from "@/lib/practice-options";
import type {
  ExactContextEvidence,
  ExactPracticeContext,
  NextPracticeAction,
  PracticeDimension,
} from "@turingcare/shared";

export const CONTEXT_DIMENSIONS = [
  { dimension: "cue_support", field: "cueSupport", labelKey: "contextProgress.cueSupport" },
  { dimension: "environment", field: "environment", labelKey: "contextProgress.environment" },
  { dimension: "distance", field: "distance", labelKey: "contextProgress.distance" },
  { dimension: "duration", field: "durationBand", labelKey: "contextProgress.durationBand" },
  { dimension: "distraction", field: "distraction", labelKey: "contextProgress.distraction" },
] as const;

export function serializeContext(context: ExactPracticeContext | null | undefined) {
  if (!context) return "none";
  return CONTEXT_DIMENSIONS.map(({ field }) => `${field}:${context[field] ?? "null"}`).join("|");
}

export function contextStatusLabel(
  status: ExactContextEvidence["status"],
  t: ReturnType<typeof useI18n>["t"],
) {
  if (status === "reliable") return t("contextProgress.reliable");
  if (status === "developing") return t("contextProgress.developing");
  return t("contextProgress.notObserved");
}

export function ContextStatusBadge({
  status,
  t,
  className = "",
}: {
  status: ExactContextEvidence["status"];
  t: ReturnType<typeof useI18n>["t"];
  className?: string;
}) {
  const tone =
    status === "reliable"
      ? "bg-emerald-50 text-emerald-800"
      : status === "developing"
        ? "bg-amber-50 text-amber-900"
        : "bg-cream text-slate-soft";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone} ${className}`}>
      {contextStatusLabel(status, t)}
    </span>
  );
}

export function contextValueLabel(
  dimension: PracticeDimension,
  value: string | null,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (value === null) return t("contextProgress.notRecorded");
  const option = DIMENSION_CONFIG[dimension].options.find((candidate) => candidate.value === value);
  return option ? t(option.labelKey) : value;
}

export function ContextLabels({
  context,
  t,
  compact = false,
}: {
  context: ExactPracticeContext;
  t: ReturnType<typeof useI18n>["t"];
  compact?: boolean;
}) {
  return (
    <dl className={compact ? "grid gap-x-3 gap-y-1 sm:grid-cols-2" : "grid gap-2 sm:grid-cols-2"}>
      {CONTEXT_DIMENSIONS.map(({ dimension, field, labelKey }) => (
        <div key={field}>
          <dt className="text-xs text-slate-soft">{t(labelKey)}</dt>
          <dd className="text-sm text-slate">{contextValueLabel(dimension, context[field], t)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function contextActionDirection(
  direction: NextPracticeAction["direction"],
  t: ReturnType<typeof useI18n>["t"],
) {
  if (direction === "easier") return t("contextProgress.directionEasier");
  if (direction === "harder") return t("contextProgress.directionHarder");
  return t("contextProgress.directionRepeat");
}

export function contextActionReason(
  action: NextPracticeAction,
  t: ReturnType<typeof useI18n>["t"],
) {
  if (action.ruleId === "ease_after_too_hard") return t("contextProgress.reasonEasier");
  if (action.ruleId === "advance_reliable_context") return t("contextProgress.reasonHarder");
  return t("contextProgress.reasonRepeat");
}
