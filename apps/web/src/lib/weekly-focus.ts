import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { suggestionKey } from "./suggestion-key";

export type FocusSession = {
  id: string;
  occurredAt: string;
  durationMinutes: number | null;
};

export type FocusSkill = {
  skillId: string;
  name: string;
  goalId: string;
  goalName: string;
  position: number;
  sessions: FocusSession[];
};

const focusApi = api.api.dogs[":id"].focus;

export function focusKey(dogId: string, weekKey: string) {
  return ["focus", dogId, weekKey] as const;
}

export function useFocusWeek(
  dogId: string,
  weekKey: string,
  timezoneOffsetMinutes: number,
  weekEndTimezoneOffsetMinutes: number,
) {
  return useQuery({
    queryKey: focusKey(dogId, weekKey),
    enabled: !!dogId,
    queryFn: async (): Promise<FocusSkill[]> => {
      const res = await focusApi.$get({
        param: { id: dogId },
        query: {
          weekKey,
          timezoneOffsetMinutes: String(timezoneOffsetMinutes),
          weekEndTimezoneOffsetMinutes: String(weekEndTimezoneOffsetMinutes),
        },
      });
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).focusSkills;
    },
  });
}

function invalidateFocus(qc: ReturnType<typeof useQueryClient>, dogId: string, weekKey: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: focusKey(dogId, weekKey) }),
    qc.invalidateQueries({ queryKey: suggestionKey(dogId, weekKey) }),
  ]);
}

export function useAddFocus(dogId: string, weekKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const res = await focusApi.$post({ param: { id: dogId }, json: { skillId, weekKey } });
      if (!res.ok) throw new Error("add_failed");
      return res.json();
    },
    onSuccess: () => invalidateFocus(qc, dogId, weekKey),
  });
}

export function useRemoveFocus(dogId: string, weekKey: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const res = await focusApi[":skillId"].$delete({
        param: { id: dogId, skillId },
        query: { weekKey },
      });
      if (!res.ok) throw new Error("remove_failed");
      return res.json();
    },
    onSuccess: () => invalidateFocus(qc, dogId, weekKey),
  });
}
