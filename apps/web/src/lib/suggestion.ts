import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdvancementDecision, SuggestionAction, TrainingSuggestion } from "@turingcare/shared";
import { api } from "./api";
import { suggestionKey } from "./suggestion-key";
import { weekKeyOf } from "./week";

export { suggestionKey } from "./suggestion-key";

const dogsApi = api.api.dogs[":id"];

export function useSuggestion(dogId: string, weekKey: string, timezoneOffsetMinutes: number) {
  return useQuery({
    queryKey: suggestionKey(dogId, weekKey),
    enabled: !!dogId && weekKey === weekKeyOf(new Date()),
    queryFn: async (): Promise<TrainingSuggestion> => {
      const res = await dogsApi.suggestion.$get({
        param: { id: dogId },
        query: { weekKey, timezoneOffsetMinutes: String(timezoneOffsetMinutes) },
      });
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).suggestion as TrainingSuggestion;
    },
  });
}

export function useSuggestionAction(dogId: string, weekKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { suggestionId: string; action: SuggestionAction }) => {
      const res = await dogsApi.suggestions[":suggestionId"].actions.$post({
        param: { id: dogId, suggestionId: args.suggestionId },
        json: { action: args.action },
      });
      if (!res.ok) throw new Error("action_failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: suggestionKey(dogId, weekKey), exact: true }),
  });
}

export function useAdvancementDecision(dogId: string, weekKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { proposalId: string; decision: AdvancementDecision }) => {
      const res = await dogsApi["advancement-proposals"][":proposalId"].decision.$post({
        param: { id: dogId, proposalId: args.proposalId },
        json: { decision: args.decision },
      });
      if (!res.ok) throw new Error("decision_failed");
      return res.json();
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: suggestionKey(dogId, weekKey) }),
        qc.invalidateQueries({ queryKey: ["progress", dogId] }),
        qc.invalidateQueries({ queryKey: ["overview"] }),
      ]),
  });
}
