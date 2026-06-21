import { useTuring } from "@/components/turing/turing-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BehaviorConcernInput, DogProfile, TrainingGoalInput } from "@turingcare/shared";
import { api } from "./api";

const dogs = api.api.dogs;

export function useDogs() {
  return useQuery({
    queryKey: ["dogs"],
    queryFn: async () => {
      const res = await dogs.$get();
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).dogs;
    },
  });
}

export function useDog(id: string) {
  return useQuery({
    queryKey: ["dogs", id],
    queryFn: async () => {
      const res = await dogs[":id"].$get({ param: { id } });
      if (!res.ok) throw new Error("not_found");
      return res.json();
    },
  });
}

export function useCreateDog() {
  const qc = useQueryClient();
  const { celebrate } = useTuring();
  return useMutation({
    mutationFn: async (body: DogProfile) => {
      const res = await dogs.$post({ json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).dog;
    },
    onSuccess: () => {
      celebrate(true);
      qc.invalidateQueries({ queryKey: ["dogs"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });
}

export function useUpdateDog(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: DogProfile) => {
      const res = await dogs[":id"].$put({ param: { id }, json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).dog;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dogs"] });
      qc.invalidateQueries({ queryKey: ["dogs", id] });
    },
  });
}

export function useDeleteDog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await dogs[":id"].$delete({ param: { id } });
      if (!res.ok) throw new Error("delete_failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dogs"] }),
  });
}

export function useAddConcern(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: BehaviorConcernInput) => {
      const res = await dogs[":id"].concerns.$post({ param: { id }, json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).concern;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dogs", id] }),
  });
}

export function useRemoveConcern(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (concernId: string) => {
      const res = await dogs[":id"].concerns[":concernId"].$delete({
        param: { id, concernId },
      });
      if (!res.ok) throw new Error("delete_failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dogs", id] }),
  });
}

export function useAddGoal(id: string) {
  const qc = useQueryClient();
  const { celebrate } = useTuring();
  return useMutation({
    mutationFn: async (body: TrainingGoalInput) => {
      const res = await dogs[":id"].goals.$post({ param: { id }, json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).goal;
    },
    onSuccess: () => {
      celebrate(false);
      qc.invalidateQueries({ queryKey: ["dogs", id] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });
}

export function useRemoveGoal(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (goalId: string) => {
      const res = await dogs[":id"].goals[":goalId"].$delete({ param: { id, goalId } });
      if (!res.ok) throw new Error("delete_failed");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dogs", id] }),
  });
}
