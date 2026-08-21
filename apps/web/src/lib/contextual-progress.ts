import { useMutation, useQuery } from "@tanstack/react-query";
import type { ContextualProgress, ContextualProgressEvent } from "@turingcare/shared";
import { api } from "./api";

export function contextualProgressDogKey(dogId: string) {
  return ["contextual-progress", dogId] as const;
}

export function contextualProgressKey(dogId: string, skillId: string) {
  return [...contextualProgressDogKey(dogId), skillId] as const;
}

export function useContextualProgress(dogId: string, skillId: string, enabled: boolean) {
  return useQuery({
    queryKey: contextualProgressKey(dogId, skillId),
    enabled: enabled && Boolean(dogId && skillId),
    queryFn: async (): Promise<ContextualProgress> => {
      const response = await api.api.dogs[":id"].skills[":skillId"]["contextual-progress"].$get({
        param: { id: dogId, skillId },
      });
      if (!response.ok) throw new Error("contextual_progress_load_failed");
      return response.json();
    },
  });
}

export function useRecordContextualProgressEvent(dogId: string) {
  return useMutation({
    mutationFn: async (event: ContextualProgressEvent) => {
      const response = await api.api.dogs[":id"]["contextual-progress"].events.$post({
        param: { id: dogId },
        json: event,
      });
      if (!response.ok) throw new Error("contextual_progress_event_failed");
      return response.json();
    },
  });
}
