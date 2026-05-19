import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JournalEntryInput } from "@turingcare/shared";
import { api } from "./api";

const j = api.api.dogs[":id"].journal;

export function useJournal(dogId: string) {
  return useQuery({
    queryKey: ["journal", dogId],
    enabled: !!dogId,
    queryFn: async () => {
      const res = await j.$get({ param: { id: dogId } });
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).entries;
    },
  });
}
export function useAddEntry(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: JournalEntryInput) => {
      const res = await j.$post({ param: { id: dogId }, json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).entry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}
export function useDeleteEntry(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const res = await api.api.dogs[":id"].journal[":entryId"].$delete({
        param: { id: dogId, entryId },
      });
      if (!res.ok) throw new Error("delete_failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}
