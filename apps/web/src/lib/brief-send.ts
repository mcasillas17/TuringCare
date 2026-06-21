import { useTuring } from "@/components/turing/turing-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BriefSendInput } from "@turingcare/shared";
import { api } from "./api";

const b = api.api.dogs[":id"].brief;

export function useBriefSends(dogId: string) {
  return useQuery({
    queryKey: ["brief-sends", dogId],
    enabled: !!dogId,
    queryFn: async () => {
      const res = await b.sends.$get({ param: { id: dogId } });
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).sends;
    },
  });
}

export function useSendBrief(dogId: string) {
  const qc = useQueryClient();
  const { celebrate } = useTuring();
  return useMutation({
    mutationFn: async (body: BriefSendInput) => {
      const res = await b.send.$post({ param: { id: dogId }, json: body });
      if (!res.ok) throw new Error(res.status === 409 ? "not_finalized" : "send_failed");
      return (await res.json()).send;
    },
    onSuccess: () => {
      celebrate(true);
      qc.invalidateQueries({ queryKey: ["brief-sends", dogId] });
      qc.invalidateQueries({ queryKey: ["onboarding"] });
    },
  });
}
