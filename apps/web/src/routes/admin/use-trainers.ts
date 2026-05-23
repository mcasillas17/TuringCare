import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TrainerInput } from "@turingcare/shared";

export type Trainer = {
  id: string;
  name: string;
  businessName: string | null;
  city: string;
  state: string;
  methodologyTags: string[];
  certifications: string[];
  specialties: string[];
  website: string | null;
  email: string | null;
  phone: string | null;
};

const TRAINERS_KEY = ["admin", "trainers"] as const;

export function useTrainers() {
  return useQuery({
    queryKey: TRAINERS_KEY,
    queryFn: async () => {
      const res = await api.api.trainers.$get();
      if (!res.ok) throw new Error("failed to load trainers");
      return ((await res.json()) as { trainers: Trainer[] }).trainers;
    },
  });
}

export function useCreateTrainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TrainerInput) => {
      const res = await api.api.admin.trainers.$post({ json: input });
      if (!res.ok) throw new Error("failed to create trainer");
      return ((await res.json()) as { trainer: Trainer }).trainer;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TRAINERS_KEY }),
  });
}

export function useUpdateTrainer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TrainerInput }) => {
      const res = await api.api.admin.trainers[":id"].$put({ param: { id }, json: input });
      if (!res.ok) throw new Error("failed to update trainer");
      return ((await res.json()) as { trainer: Trainer }).trainer;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TRAINERS_KEY }),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: TRAINERS_KEY }),
  });
}
