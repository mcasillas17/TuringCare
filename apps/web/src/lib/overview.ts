import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export function useOverview() {
  return useQuery({
    queryKey: ["overview"],
    queryFn: async () => {
      const res = await api.api.overview.$get();
      if (!res.ok) throw new Error("load_failed");
      return res.json();
    },
  });
}
