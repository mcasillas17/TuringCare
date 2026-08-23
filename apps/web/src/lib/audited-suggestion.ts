import type { QueryClient } from "@tanstack/react-query";
import type { Locale } from "@turingcare/i18n";
import type { TrainingSuggestion } from "@turingcare/shared";
import { suggestionKey } from "./suggestion-key";
import { type FocusSkill, focusKey } from "./weekly-focus";

export type AuditedSuggestionTarget = {
  focusSkill: FocusSkill;
  suggestion: TrainingSuggestion;
};

export type AuditedSuggestionTargetState =
  | { status: "eligible"; target: AuditedSuggestionTarget }
  | { status: "pending" }
  | { status: "ineligible" };

export type AuditedSuggestionTargetInput = {
  dogId: string;
  weekKey: string;
  currentWeekKey: string;
  locale: Locale;
  skillId: string;
  suggestionId?: string;
};

function isSettledSuccessfulQuery(query: ReturnType<QueryClient["getQueryState"]>) {
  return query?.status === "success" && query.fetchStatus === "idle" && query.error == null;
}

function isQueryUnsettled(query: ReturnType<QueryClient["getQueryState"]>) {
  return (
    query?.status === "pending" ||
    (query?.fetchStatus !== undefined && query.fetchStatus !== "idle")
  );
}

export function getAuditedSuggestionTargetState(
  queryClient: QueryClient,
  { dogId, weekKey, currentWeekKey, locale, skillId, suggestionId }: AuditedSuggestionTargetInput,
): AuditedSuggestionTargetState {
  if (!dogId || weekKey !== currentWeekKey) return { status: "ineligible" };

  const currentSuggestionKey = suggestionKey(dogId, weekKey, locale);
  const currentFocusKey = focusKey(dogId, weekKey);
  const suggestionQuery = queryClient.getQueryState<TrainingSuggestion>(currentSuggestionKey);
  const focusQuery = queryClient.getQueryState<FocusSkill[]>(currentFocusKey);
  if (isQueryUnsettled(suggestionQuery) || isQueryUnsettled(focusQuery)) {
    return { status: "pending" };
  }
  if (!isSettledSuccessfulQuery(suggestionQuery) || !isSettledSuccessfulQuery(focusQuery)) {
    return { status: "ineligible" };
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
    return { status: "ineligible" };
  }

  const summarySafetySkill = focusSkills.find(
    (focus) =>
      focus.contextualProgress.status === "ready" && focus.contextualProgress.summary.safety,
  );
  const summarySafety =
    summarySafetySkill?.contextualProgress.status === "ready"
      ? summarySafetySkill.contextualProgress.summary.safety
      : null;
  if (suggestion.safety ?? summarySafety) return { status: "ineligible" };

  return { status: "eligible", target: { focusSkill, suggestion } };
}

export function getAuditedSuggestionTarget(
  queryClient: QueryClient,
  input: AuditedSuggestionTargetInput,
): AuditedSuggestionTarget | null {
  const state = getAuditedSuggestionTargetState(queryClient, input);
  return state.status === "eligible" ? state.target : null;
}
