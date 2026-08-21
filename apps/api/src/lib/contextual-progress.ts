import type {
  ContextualProgress,
  ExactContextEvidence,
  ExactPracticeContext,
  NextPracticeAction,
  PracticeDimension,
  PracticeOutcome,
  SkillDimensionMetadata,
} from "@turingcare/shared";
import { adjacentContext } from "./context-adjacency";

export const CONTEXTUAL_PROGRESS_POLICY_VERSION = "2026-08-20";
export const CONTEXTUAL_PROGRESS_WINDOW_DAYS = 21;

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
  evidence: ExactContextEvidence;
};

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

function deriveAdjacentAction(
  source: ExactPracticeContext,
  metadata: SkillDimensionMetadata | null,
  curriculumLevel: number,
  direction: "easier" | "harder",
  ruleId: "ease_after_too_hard" | "advance_reliable_context",
): NextPracticeAction | null {
  if (!metadata) return null;

  const stepIndex = direction === "easier" ? curriculumLevel - 2 : curriculumLevel - 1;
  const dimension: PracticeDimension | undefined =
    curriculumLevel === 1 && direction === "easier"
      ? metadata.baseEase.dimension
      : metadata.levelSteps[stepIndex];
  const strategy =
    curriculumLevel === 1 && direction === "easier"
      ? metadata.baseEase.strategy
      : metadata.levelStepStrategies[stepIndex];
  if (!dimension || !strategy) return null;

  const adjacent = adjacentContext(source, dimension, direction, strategy);
  if (!adjacent) return null;

  return {
    ruleId,
    direction,
    context: adjacent.context,
    changedDimension: adjacent.changedDimension,
  };
}

function deriveAction(input: {
  latestRow: EligibleContextualProgressRow | undefined;
  strongest: ExactContextEvidence | null;
  curriculumLevel: number;
  metadata: SkillDimensionMetadata | null;
}): NextPracticeAction | null {
  if (input.latestRow?.outcome === "too_hard") {
    return deriveAdjacentAction(
      input.latestRow.context,
      input.metadata,
      input.curriculumLevel,
      "easier",
      "ease_after_too_hard",
    );
  }

  if (!input.strongest) return null;

  if (input.strongest.status === "reliable" && input.curriculumLevel < 5) {
    return deriveAdjacentAction(
      input.strongest.context,
      input.metadata,
      input.curriculumLevel,
      "harder",
      "advance_reliable_context",
    );
  }

  if (input.strongest.status === "developing") {
    return {
      ruleId: "repeat_developing_context",
      direction: "repeat",
      context: input.strongest.context,
      changedDimension: null,
    };
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
    strongest,
    curriculumLevel: input.curriculumLevel,
    metadata: input.metadata,
  });
  const exactContexts = observed.map(({ evidence }) => evidence);

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
    exactContexts,
  };
}
