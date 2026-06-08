import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

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

export function focusKey(dogId: string) {
  return ["focus", dogId] as const;
}

export function useFocusWeek(dogId: string, weekStart: string, weekEnd: string) {
  return useQuery({
    queryKey: ["focus", dogId, weekStart],
    enabled: !!dogId,
    queryFn: async (): Promise<FocusSkill[]> => {
      const res = await focusApi.$get({ param: { id: dogId }, query: { weekStart, weekEnd } });
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).focusSkills;
    },
  });
}

export function useAddFocus(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const res = await focusApi.$post({ param: { id: dogId }, json: { skillId } });
      if (!res.ok) throw new Error("add_failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: focusKey(dogId) }),
  });
}

export function useRemoveFocus(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const res = await focusApi[":skillId"].$delete({ param: { id: dogId, skillId } });
      if (!res.ok) throw new Error("remove_failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: focusKey(dogId) }),
  });
}
