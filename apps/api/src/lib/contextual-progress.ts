import { CONTEXTUAL_PROGRESS_WINDOW_DAYS } from "@turingcare/shared";
import type {
  ContextualProgress,
  ContextualProgressSummary,
  ExactContextEvidence,
  ExactPracticeContext,
  NextPracticeAction,
  ObservedExactContextEvidence,
  PracticeDimension,
  PracticeOutcome,
  SkillDimensionMetadata,
  SuggestionSafety,
} from "@turingcare/shared";
import { adjacentContext, isContextNoHarderThan } from "./context-adjacency";

export const CONTEXTUAL_PROGRESS_POLICY_VERSION = "2026-08-20";

const DAY_MS = 24 * 60 * 60 * 1000;

const contextFields = [
  "cueSupport",
  "environment",
  "distance",
  "durationBand",
  "distraction",
] as const satisfies readonly (keyof ExactPracticeContext)[];

export type ContextualProgressRow = {
  id: string;
  outcome: PracticeOutcome | null;
  occurredAt: Date;
  practiceDay: string | null;
  curriculumLevel: number | null;
  curriculumVersion: string | null;
  cueSupport: ExactPracticeContext["cueSupport"];
  environment: ExactPracticeContext["environment"];
  distance: ExactPracticeContext["distance"];
  durationBand: ExactPracticeContext["durationBand"];
  distraction: ExactPracticeContext["distraction"];
};

type EligibleContextualProgressRow = {
  id: string;
  outcome: PracticeOutcome;
  occurredAt: Date;
  practiceDay: string;
  context: ExactPracticeContext;
};

type ObservedContext = {
  key: string;
  evidence: ObservedExactContextEvidence;
};

type ReviewedContextStep = SkillDimensionMetadata["baseEase"];

export function applyContextualSafety(
  progress: ContextualProgress,
  safety: SuggestionSafety | null,
): ContextualProgress;
export function applyContextualSafety(
  progress: ContextualProgressSummary,
  safety: SuggestionSafety | null,
): ContextualProgressSummary;
export function applyContextualSafety(
  progress: ContextualProgress | ContextualProgressSummary,
  safety: SuggestionSafety | null,
): ContextualProgress | ContextualProgressSummary {
  const applied = {
    ...progress,
    nextPracticeAction: safety ? null : progress.nextPracticeAction,
    safety,
  };

  if (!("exactContexts" in progress)) return applied;

  return {
    ...applied,
    exactContexts: safety
      ? progress.exactContexts.filter((evidence) => evidence.status !== "not_observed")
      : progress.exactContexts,
  };
}

function serializeContext(context: ExactPracticeContext): string {
  return JSON.stringify({
    cueSupport: context.cueSupport,
    environment: context.environment,
    distance: context.distance,
    durationBand: context.durationBand,
    distraction: context.distraction,
  });
}

function compareDescendingStrings(left: string, right: string): number {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

function compareRowsDescending(
  left: EligibleContextualProgressRow,
  right: EligibleContextualProgressRow,
) {
  return (
    right.occurredAt.getTime() - left.occurredAt.getTime() ||
    compareDescendingStrings(left.id, right.id)
  );
}

function toContext(row: ContextualProgressRow): ExactPracticeContext {
  return {
    cueSupport: row.cueSupport,
    environment: row.environment,
    distance: row.distance,
    durationBand: row.durationBand,
    distraction: row.distraction,
  };
}

function hasContext(row: ContextualProgressRow): boolean {
  return contextFields.some((field) => row[field] !== null);
}

function filterEligibleRows(input: {
  now: Date;
  curriculumLevel: number;
  curriculumVersion: string;
  rows: ContextualProgressRow[];
}): EligibleContextualProgressRow[] {
  const cutoff = input.now.getTime() - CONTEXTUAL_PROGRESS_WINDOW_DAYS * DAY_MS;

  return input.rows
    .filter(
      (
        row,
      ): row is ContextualProgressRow & {
        outcome: PracticeOutcome;
        practiceDay: string;
      } =>
        row.occurredAt.getTime() >= cutoff &&
        row.occurredAt.getTime() <= input.now.getTime() &&
        row.curriculumLevel === input.curriculumLevel &&
        row.curriculumVersion === input.curriculumVersion &&
        row.outcome !== null &&
        row.practiceDay !== null &&
        hasContext(row),
    )
    .map((row) => ({
      id: row.id,
      outcome: row.outcome,
      occurredAt: row.occurredAt,
      practiceDay: row.practiceDay,
      context: toContext(row),
    }));
}

function deriveObservedEvidence(
  key: string,
  rows: EligibleContextualProgressRow[],
): ObservedContext {
  const sortedRows = [...rows].sort(compareRowsDescending);
  const latestRow = sortedRows[0];
  if (!latestRow) {
    throw new Error("Cannot derive contextual evidence from an empty group");
  }
  const successfulDistinctDays = new Set(
    sortedRows.filter((row) => row.outcome === "went_well").map((row) => row.practiceDay),
  ).size;
  const reliable =
    successfulDistinctDays >= 2 && !sortedRows.some((row) => row.outcome === "too_hard");
  const latestSuccessful = sortedRows.find((row) => row.outcome === "went_well");

  return {
    key,
    evidence: {
      context: latestRow.context,
      status: reliable ? "reliable" : "developing",
      successfulDistinctDays,
      latestOutcome: latestRow.outcome,
      lastObservedAt: latestRow.occurredAt.toISOString(),
      lastSuccessfulAt: latestSuccessful?.occurredAt.toISOString() ?? null,
    },
  };
}

function compareObservedContexts(left: ObservedContext, right: ObservedContext): number {
  const leftStatusRank = left.evidence.status === "reliable" ? 0 : 1;
  const rightStatusRank = right.evidence.status === "reliable" ? 0 : 1;
  if (leftStatusRank !== rightStatusRank) return leftStatusRank - rightStatusRank;

  if (left.evidence.successfulDistinctDays !== right.evidence.successfulDistinctDays) {
    return right.evidence.successfulDistinctDays - left.evidence.successfulDistinctDays;
  }

  const leftRelevantAt =
    left.evidence.status === "reliable"
      ? left.evidence.lastSuccessfulAt
      : left.evidence.lastObservedAt;
  const rightRelevantAt =
    right.evidence.status === "reliable"
      ? right.evidence.lastSuccessfulAt
      : right.evidence.lastObservedAt;
  const timestampDifference =
    new Date(rightRelevantAt ?? 0).getTime() - new Date(leftRelevantAt ?? 0).getTime();
  if (timestampDifference !== 0) return timestampDifference;

  return left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
}

function deriveAdjacentContext(
  source: ExactPracticeContext,
  catalogSkillKey: string | null,
  metadata: SkillDimensionMetadata | null,
  curriculumLevel: number,
  direction: "easier" | "harder",
): ExactPracticeContext | null {
  if (!catalogSkillKey || !metadata) return null;

  const step = getReviewedContextStep(metadata, curriculumLevel, direction);
  if (!step) return null;

  const adjacent = adjacentContext(source, step.dimension, direction, step.strategy);
  return adjacent?.context ?? null;
}

function deriveAdjacentAction(
  source: ExactPracticeContext,
  catalogSkillKey: string | null,
  metadata: SkillDimensionMetadata | null,
  curriculumLevel: number,
  direction: "easier" | "harder",
  ruleId: "ease_after_too_hard" | "advance_reliable_context",
): NextPracticeAction | null {
  const adjacent = deriveAdjacentContext(
    source,
    catalogSkillKey,
    metadata,
    curriculumLevel,
    direction,
  );
  if (!adjacent) return null;

  return {
    ruleId,
    direction,
    context: adjacent,
    changedDimension: getChangedDimension(source, adjacent),
  };
}

function getChangedDimension(
  source: ExactPracticeContext,
  target: ExactPracticeContext,
): PracticeDimension {
  const changedDimension = contextFields.find((field) => source[field] !== target[field]);
  if (!changedDimension) throw new Error("reviewed adjacent context did not change");
  const dimensionByField = {
    cueSupport: "cue_support",
    environment: "environment",
    distance: "distance",
    durationBand: "duration",
    distraction: "distraction",
  } as const;
  return dimensionByField[changedDimension];
}

function getReviewedContextStep(
  metadata: SkillDimensionMetadata,
  curriculumLevel: number,
  direction: "easier" | "harder",
): ReviewedContextStep | null {
  if (curriculumLevel === 1 && direction === "easier") {
    return metadata.baseEase;
  }

  const stepIndex = direction === "easier" ? curriculumLevel - 2 : curriculumLevel - 1;
  const dimension = metadata.levelSteps[stepIndex];
  const strategy = metadata.levelStepStrategies[stepIndex];
  if (!dimension || !strategy) return null;

  return { dimension, strategy };
}

function deriveDevelopingRepeat(
  observed: ObservedContext[],
  options: {
    excludedKeys?: readonly string[];
    noHarderThan?: ExactPracticeContext;
    metadata?: SkillDimensionMetadata | null;
  } = {},
): NextPracticeAction | null {
  const excludedKeys = new Set(options.excludedKeys);
  const developing = observed.find(
    ({ key, evidence }) =>
      evidence.status === "developing" &&
      !excludedKeys.has(key) &&
      (!options.noHarderThan ||
        isContextNoHarderThan(evidence.context, options.noHarderThan, options.metadata ?? null)),
  );
  if (!developing) return null;

  return {
    ruleId: "repeat_developing_context",
    direction: "repeat",
    context: developing.evidence.context,
    changedDimension: null,
  };
}

function isUnobservedOrReliableWithoutTooHard(
  evidence: ObservedExactContextEvidence | undefined,
): boolean {
  return !evidence || (evidence.status === "reliable" && evidence.latestOutcome !== "too_hard");
}

function deriveAction(input: {
  latestRow: EligibleContextualProgressRow | undefined;
  observed: ObservedContext[];
  strongest: ExactContextEvidence | null;
  curriculumLevel: number;
  catalogSkillKey: string | null;
  metadata: SkillDimensionMetadata | null;
}): NextPracticeAction | null {
  if (input.latestRow?.outcome === "too_hard") {
    const failedKey = serializeContext(input.latestRow.context);
    const easierAction = deriveAdjacentAction(
      input.latestRow.context,
      input.catalogSkillKey,
      input.metadata,
      input.curriculumLevel,
      "easier",
      "ease_after_too_hard",
    );

    if (easierAction) {
      const easierKey = serializeContext(easierAction.context);
      const observedEasier = input.observed.find(({ key }) => key === easierKey)?.evidence;
      if (!observedEasier) return easierAction;

      if (isUnobservedOrReliableWithoutTooHard(observedEasier)) {
        return null;
      }

      return deriveDevelopingRepeat(input.observed, {
        excludedKeys: [failedKey, easierKey],
        noHarderThan: input.latestRow.context,
        metadata: input.metadata,
      });
    }

    return deriveDevelopingRepeat(input.observed, {
      excludedKeys: [failedKey],
      noHarderThan: input.latestRow.context,
      metadata: input.metadata,
    });
  }

  if (!input.strongest) return null;

  if (input.strongest.status === "reliable") {
    const harderContext = deriveAdjacentContext(
      input.strongest.context,
      input.catalogSkillKey,
      input.metadata,
      input.curriculumLevel,
      "harder",
    );
    if (!harderContext) return deriveDevelopingRepeat(input.observed);

    const harderKey = serializeContext(harderContext);
    const observedHarder = input.observed.find(({ key }) => key === harderKey)?.evidence;
    if (!isUnobservedOrReliableWithoutTooHard(observedHarder)) {
      return deriveDevelopingRepeat(input.observed, { excludedKeys: [harderKey] });
    }

    return {
      ruleId: "advance_reliable_context",
      direction: "harder",
      context: harderContext,
      changedDimension: getChangedDimension(input.strongest.context, harderContext),
    };
  }

  if (input.strongest.status === "developing") {
    return deriveDevelopingRepeat(input.observed);
  }

  return null;
}

export function deriveContextualProgress(input: {
  now: Date;
  curriculumLevel: number;
  curriculumVersion: string;
  catalogSkillKey: string | null;
  metadata: SkillDimensionMetadata | null;
  rows: ContextualProgressRow[];
}): ContextualProgress {
  const eligibleRows = filterEligibleRows(input);
  const rowsByContext = new Map<string, EligibleContextualProgressRow[]>();
  for (const row of eligibleRows) {
    const key = serializeContext(row.context);
    const group = rowsByContext.get(key);
    if (group) {
      group.push(row);
    } else {
      rowsByContext.set(key, [row]);
    }
  }

  const observed = [...rowsByContext.entries()]
    .map(([key, rows]) => deriveObservedEvidence(key, rows))
    .sort(compareObservedContexts);
  const strongest = observed[0]?.evidence ?? null;
  const eligibleByRecency = [...eligibleRows].sort(compareRowsDescending);
  const nextPracticeAction = deriveAction({
    latestRow: eligibleByRecency[0],
    observed,
    strongest,
    curriculumLevel: input.curriculumLevel,
    catalogSkillKey: input.catalogSkillKey,
    metadata: input.metadata,
  });
  const exactContexts: ExactContextEvidence[] = observed.map(({ evidence }) => evidence);

  if (
    nextPracticeAction &&
    nextPracticeAction.direction !== "repeat" &&
    !observed.some(({ key }) => key === serializeContext(nextPracticeAction.context))
  ) {
    exactContexts.push({
      context: nextPracticeAction.context,
      status: "not_observed",
      successfulDistinctDays: 0,
      latestOutcome: null,
      lastObservedAt: null,
      lastSuccessfulAt: null,
    });
  }

  const startsAt = new Date(input.now.getTime() - CONTEXTUAL_PROGRESS_WINDOW_DAYS * DAY_MS);
  return {
    window: {
      startsAt: startsAt.toISOString(),
      endsAt: input.now.toISOString(),
      days: CONTEXTUAL_PROGRESS_WINDOW_DAYS,
    },
    curriculumLevel: input.curriculumLevel,
    curriculumVersion: input.curriculumVersion,
    policyVersion: CONTEXTUAL_PROGRESS_POLICY_VERSION,
    strongestContext: strongest,
    nextPracticeAction,
    safety: null,
    exactContexts,
  };
}
