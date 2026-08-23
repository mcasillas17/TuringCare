import type { BriefWindow } from "@turingcare/shared";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTuring } from "@/components/turing/turing-context";
import { api } from "./api";
import { readBriefRequestError } from "./brief-errors";

const b = api.api.dogs[":id"].brief;

export function useBrief(dogId: string) {
  return useQuery({
    queryKey: ["brief", dogId],
    enabled: !!dogId,
    queryFn: async () => {
      const res = await b.$get({ param: { id: dogId } });
      if (!res.ok) throw await readBriefRequestError(res, "load", "load_failed");
      return (await res.json()).brief;
    },
  });
}
export function useGenerateBrief(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (window: BriefWindow) => {
      const res = await b.$post({ param: { id: dogId }, query: { window } });
      if (!res.ok) throw await readBriefRequestError(res, "generate", "gen_failed");
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
  const { celebrate } = useTuring();
  return useMutation({
    mutationFn: async () => {
      const res = await b.$put({ param: { id: dogId } });
      if (!res.ok) throw await readBriefRequestError(res, "finalize", "save_failed");
      return (await res.json()).brief;
    },
    onSuccess: () => {
      celebrate(true, "turing.celebrateBrief");
      qc.invalidateQueries({ queryKey: ["brief", dogId] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });
}
export function useShareBrief(dogId: string) {
  const qc = useQueryClient();
  const { celebrate } = useTuring();
  return useMutation({
    mutationFn: async () => {
      const res = await b.share.$post({ param: { id: dogId } });
      if (!res.ok) throw await readBriefRequestError(res, "share", "share_failed");
      return (await res.json()) as { token: string; url: string };
    },
    onSuccess: () => {
      celebrate(true, "turing.celebrateBrief");
      qc.invalidateQueries({ queryKey: ["brief", dogId] });
    },
  });
}
export function useRevokeShare(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await b.share.$delete({ param: { id: dogId } });
      if (!res.ok) throw await readBriefRequestError(res, "revoke", "revoke_failed");
      return (await res.json()) as { ok: true };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brief", dogId] }),
  });
}
