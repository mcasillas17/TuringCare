import { useTuring } from "@/components/turing/turing-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  JournalEntryCreateInput,
  JournalEntryKind,
  JournalEntryUpdateInput,
  JournalTrend,
} from "@turingcare/shared";
import { api } from "./api";

const dogJournal = api.api.dogs[":id"].journal;

export type JournalEntry = {
  id: string;
  dogId: string;
  kind: JournalEntryKind;
  occurredAt: string | Date;
  note: string;
  trend: JournalTrend | null;
  antecedent: string | null;
  behavior: string | null;
  consequence: string | null;
  intensity: number | null;
  location: string | null;
  notes: string | null;
  durationSeconds: number | null;
  recoverySeconds: number | null;
  peoplePresent: string | null;
  ownerResponse: string | null;
  dog?: { id: string; name: string };
};

export function useJournal(dogId?: string) {
  return useQuery({
    queryKey: ["journal", { dogId: dogId ?? null }],
    queryFn: async () => {
      const res = dogId
        ? await api.api.journal.$get({ query: { dogId } })
        : await api.api.journal.$get();
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).entries as JournalEntry[];
    },
  });
}

export function useDogJournal(dogId: string) {
  return useQuery({
    queryKey: ["dog-journal", dogId],
    enabled: !!dogId,
    queryFn: async () => {
      const res = await dogJournal.$get({ param: { id: dogId } });
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).entries as JournalEntry[];
    },
  });
}

export function useAddEntry(dogId: string) {
  const qc = useQueryClient();
  const { celebrate } = useTuring();
  return useMutation({
    mutationFn: async (body: JournalEntryCreateInput) => {
      const res = await dogJournal.$post({ param: { id: dogId }, json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).entry as JournalEntry;
    },
    onSuccess: () => {
      celebrate(false);
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dog-journal", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
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
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dog-journal", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}

export function useUpdateEntry(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { entryId: string; body: JournalEntryUpdateInput }) => {
      const res = await dogJournal[":entryId"].$put({
        param: { id: dogId, entryId: args.entryId },
        json: args.body,
      });
      if (!res.ok) throw new Error("update_failed");
      return (await res.json()).entry as JournalEntry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["dog-journal", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
    },
  });
}
