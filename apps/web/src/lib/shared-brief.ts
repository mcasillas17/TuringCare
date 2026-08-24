import { useQuery } from "@tanstack/react-query";
import type { Locale } from "@turingcare/i18n";
import { api } from "./api";

export type SharedBrief = {
  dogName: string;
  summary: string;
  status: string;
  version: number;
  generatedAt: string;
  locale: Locale;
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
