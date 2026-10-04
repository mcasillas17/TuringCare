import { api } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TrainerInput } from "@turingcare/shared";

export function useCreateTrainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TrainerInput) => {
      const res = await api.api.admin.trainers.$post({ json: input });
      if (!res.ok) throw new Error("failed to create trainer");
      return (await res.json()).trainer;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trainers"] }),
  });
}

export function useUpdateTrainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TrainerInput }) => {
      const res = await api.api.admin.trainers[":id"].$put({ param: { id }, json: input });
      if (!res.ok) throw new Error("failed to update trainer");
      return (await res.json()).trainer;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trainers"] }),
  });
}

export function useDeleteTrainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.admin.trainers[":id"].$delete({ param: { id } });
      if (!res.ok) throw new Error("failed to delete trainer");
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trainers"] }),
  });
}
