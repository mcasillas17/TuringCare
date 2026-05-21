import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type TrainerFilters = { state?: string; specialty?: string; methodology?: string };

export function useTrainers(f: TrainerFilters) {
  return useQuery({
    queryKey: ["trainers", f],
    queryFn: async () => {
      const res = await api.api.trainers.$get({ query: f });
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).trainers;
    },
  });
}
export function useTrainer(id: string) {
  return useQuery({
    queryKey: ["trainers", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await api.api.trainers[":id"].$get({ param: { id } });
      if (!res.ok) throw new Error("not_found");
      return (await res.json()).trainer;
    },
  });
}
