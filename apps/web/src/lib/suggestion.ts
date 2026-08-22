import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdvancementDecision, SuggestionAction, TrainingSuggestion } from "@turingcare/shared";
import { api } from "./api";
import { invalidatePracticeDerivedData } from "./progress";
import { suggestionKey } from "./suggestion-key";
import { weekKeyAtOffset } from "./week";

export { suggestionKey } from "./suggestion-key";

const dogsApi = api.api.dogs[":id"];

export function useSuggestion(dogId: string, weekKey: string, timezoneOffsetMinutes: number) {
  return useQuery({
    queryKey: suggestionKey(dogId, weekKey),
    enabled: !!dogId && weekKey === weekKeyAtOffset(new Date(), timezoneOffsetMinutes),
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
      if (!res.ok) {
        const failed = await res.json();
        throw new Error("error" in failed ? failed.error : "action_failed");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: suggestionKey(dogId, weekKey) }),
  });
}

export function useAdvancementDecision(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { proposalId: string; decision: AdvancementDecision }) => {
      const res = await dogsApi["advancement-proposals"][":proposalId"].decision.$post({
        param: { id: dogId, proposalId: args.proposalId },
        json: { decision: args.decision },
      });
      if (!res.ok) {
        const failed = await res.json();
        throw new Error("error" in failed ? failed.error : "decision_failed");
      }
      return res.json();
    },
    onSuccess: () => invalidatePracticeDerivedData(qc, dogId),
  });
}
