import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

const b = api.api.dogs[":id"].brief;

export function useBrief(dogId: string) {
  return useQuery({
    queryKey: ["brief", dogId],
    enabled: !!dogId,
    queryFn: async () => {
      const res = await b.$get({ param: { id: dogId } });
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).brief;
    },
  });
}
export function useGenerateBrief(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await b.$post({ param: { id: dogId } });
      if (!res.ok) throw new Error("gen_failed");
      return (await res.json()).brief;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brief", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}
export function useFinalizeBrief(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await b.$put({ param: { id: dogId } });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).brief;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brief", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}
