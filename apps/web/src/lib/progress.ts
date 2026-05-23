import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PracticeSessionInput,
  SkillConfidenceInput,
  TrainingSkillInput,
} from "@turingcare/shared";
import { api } from "./api";

export type ProgressSession = {
  id: string;
  occurredAt: string;
  durationMinutes: number | null;
  notes: string | null;
  createdAt: string;
};

export type ProgressSkill = {
  id: string;
  name: string;
  confidence: number;
  position: number;
  sessionCount: number;
  firstSessionAt: string | null;
  lastSessionAt: string | null;
  lastNote: string | null;
  sessions: ProgressSession[];
};

export type ProgressGoal = {
  id: string;
  goal: string;
  avgConfidence: number | null;
  skills: ProgressSkill[];
};

const dogProgress = api.api.dogs[":id"].progress;
const dogGoals = api.api.dogs[":id"].goals;
const dogSkills = api.api.dogs[":id"].skills;

function invalidateProgress(qc: ReturnType<typeof useQueryClient>, dogId: string) {
  qc.invalidateQueries({ queryKey: ["progress", dogId] });
}

export function useProgress(dogId: string) {
  return useQuery({
    queryKey: ["progress", dogId],
    enabled: !!dogId,
    queryFn: async (): Promise<ProgressGoal[]> => {
      const res = await dogProgress.$get({ param: { id: dogId } });
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).goals;
    },
  });
}

export function useAddSkill(dogId: string, goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TrainingSkillInput) => {
      const res = await dogGoals[":goalId"].skills.$post({
        param: { id: dogId, goalId },
        json: body,
      });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).skill;
    },
    onSuccess: () => invalidateProgress(qc, dogId),
  });
}

export function useUpdateSkill(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { skillId: string; body: TrainingSkillInput }) => {
      const res = await dogSkills[":skillId"].$put({
        param: { id: dogId, skillId: args.skillId },
        json: args.body,
      });
      if (!res.ok) throw new Error("update_failed");
      return (await res.json()).skill;
    },
    onSuccess: () => invalidateProgress(qc, dogId),
  });
}

export function useUpdateSkillConfidence(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { skillId: string; body: SkillConfidenceInput }) => {
      const res = await dogSkills[":skillId"].confidence.$patch({
        param: { id: dogId, skillId: args.skillId },
        json: args.body,
      });
      if (!res.ok) throw new Error("update_failed");
      return (await res.json()).skill;
    },
    onSuccess: () => invalidateProgress(qc, dogId),
  });
}

export function useDeleteSkill(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (skillId: string) => {
      const res = await dogSkills[":skillId"].$delete({ param: { id: dogId, skillId } });
      if (!res.ok) throw new Error("delete_failed");
      return res.json();
    },
    onSuccess: () => invalidateProgress(qc, dogId),
  });
}

export function useLogSession(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { skillId: string; body: PracticeSessionInput }) => {
      const res = await dogSkills[":skillId"].sessions.$post({
        param: { id: dogId, skillId: args.skillId },
        json: args.body,
      });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).session;
    },
    onSuccess: () => invalidateProgress(qc, dogId),
  });
}

export function useDeleteSession(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { skillId: string; sessionId: string }) => {
      const res = await dogSkills[":skillId"].sessions[":sessionId"].$delete({
        param: { id: dogId, skillId: args.skillId, sessionId: args.sessionId },
      });
      if (!res.ok) throw new Error("delete_failed");
      return res.json();
    },
    onSuccess: () => invalidateProgress(qc, dogId),
  });
}
