import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProfileUpdateInput } from "@turingcare/shared";
import { api } from "./api";

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const res = await api.api.profile.$get();
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).user;
    },
  });
}
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ProfileUpdateInput) => {
      const res = await api.api.profile.$put({ json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).user;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
