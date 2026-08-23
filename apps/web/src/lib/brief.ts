import type { BriefWindow } from "@turingcare/shared";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTuring } from "@/components/turing/turing-context";
import { api } from "./api";

const b = api.api.dogs[":id"].brief;

async function fetchBrief(dogId: string) {
  const res = await b.$get({ param: { id: dogId } });
  if (!res.ok) throw new Error("load_failed");
  return (await res.json()).brief;
}

type CachedBrief = Awaited<ReturnType<typeof fetchBrief>>;

export function useBrief(dogId: string) {
  return useQuery({
    queryKey: ["brief", dogId],
    enabled: !!dogId,
    queryFn: () => fetchBrief(dogId),
  });
}
export function useGenerateBrief(dogId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (window: BriefWindow) => {
      const res = await b.$post({ param: { id: dogId }, query: { window } });
      if (!res.ok) throw new Error("gen_failed");
      return (await res.json()).brief;
    },
    onSuccess: (brief) => {
      qc.setQueryData<CachedBrief>(["brief", dogId], brief);
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
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).brief;
    },
    onSuccess: (brief) => {
      qc.setQueryData<CachedBrief>(["brief", dogId], brief);
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
      if (!res.ok) throw new Error("share_failed");
      return (await res.json()) as { token: string; url: string };
    },
    onSuccess: ({ token }) => {
      qc.setQueryData<CachedBrief>(["brief", dogId], (brief) =>
        brief ? { ...brief, shareToken: token } : brief,
      );
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
      if (!res.ok) throw new Error("revoke_failed");
      return (await res.json()) as { ok: true };
    },
    onSuccess: () => {
      qc.setQueryData<CachedBrief>(["brief", dogId], (brief) =>
        brief ? { ...brief, shareToken: null } : brief,
      );
      qc.invalidateQueries({ queryKey: ["brief", dogId] });
    },
  });
}
