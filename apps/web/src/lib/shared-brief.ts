import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type SharedBrief = {
  dogName: string;
  summary: string;
  narrative: string | null;
  status: string;
  version: number;
  generatedAt: string;
};

export function useSharedBrief(token: string) {
  return useQuery({
    queryKey: ["shared-brief", token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      const res = await api.api.share.brief[":token"].$get({ param: { token } });
      if (!res.ok) throw new Error("not_found");
      return (await res.json()).brief as SharedBrief;
    },
  });
}
