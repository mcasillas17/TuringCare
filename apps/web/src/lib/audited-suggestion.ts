import type { QueryClient } from "@tanstack/react-query";
import type { TrainingSuggestion } from "@turingcare/shared";
import { suggestionKey } from "./suggestion-key";
import { type FocusSkill, focusKey } from "./weekly-focus";

export type AuditedSuggestionTarget = {
  focusSkill: FocusSkill;
  suggestion: TrainingSuggestion;
};

type AuditedSuggestionTargetInput = {
  dogId: string;
  weekKey: string;
  currentWeekKey: string;
  skillId: string;
  suggestionId?: string;
};

function isSettledSuccessfulQuery(query: ReturnType<QueryClient["getQueryState"]>) {
  return query?.status === "success" && query.fetchStatus === "idle" && query.error == null;
}

export function getAuditedSuggestionTarget(
  queryClient: QueryClient,
  { dogId, weekKey, currentWeekKey, skillId, suggestionId }: AuditedSuggestionTargetInput,
): AuditedSuggestionTarget | null {
  if (!dogId || weekKey !== currentWeekKey) return null;

  const currentSuggestionKey = suggestionKey(dogId, weekKey);
  const currentFocusKey = focusKey(dogId, weekKey);
  const suggestionQuery = queryClient.getQueryState<TrainingSuggestion>(currentSuggestionKey);
  const focusQuery = queryClient.getQueryState<FocusSkill[]>(currentFocusKey);
  if (!isSettledSuccessfulQuery(suggestionQuery) || !isSettledSuccessfulQuery(focusQuery)) {
    return null;
  }

  const suggestion = queryClient.getQueryData<TrainingSuggestion>(currentSuggestionKey);
  const focusSkills = queryClient.getQueryData<FocusSkill[]>(currentFocusKey);
  const focusSkill = focusSkills?.find((focus) => focus.skillId === skillId);
  if (
    !suggestion ||
    !focusSkills ||
    !focusSkill ||
    suggestion.type !== "exercise" ||
    suggestion.dismissed ||
    suggestion.weekKey !== weekKey ||
    !suggestion.suggestionId ||
    suggestion.skill?.id !== skillId ||
    (suggestionId !== undefined && suggestion.suggestionId !== suggestionId)
  ) {
    return null;
  }

  const summarySafetySkill = focusSkills.find(
    (focus) =>
      focus.contextualProgress.status === "ready" && focus.contextualProgress.summary.safety,
  );
  const summarySafety =
    summarySafetySkill?.contextualProgress.status === "ready"
      ? summarySafetySkill.contextualProgress.summary.safety
      : null;
  if (suggestion.safety ?? summarySafety) return null;

  return { focusSkill, suggestion };
}
