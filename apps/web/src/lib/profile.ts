import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Locale } from "@turingcare/i18n";
import type { ProfileLocaleUpdateInput, ProfileUpdateInput } from "@turingcare/shared";
import { api } from "./api";

export type ProfileUser = {
  id: string;
  name: string;
  email: string;
  locale: Locale | null;
};

function profileQueryKey(userId?: string | null) {
  return userId ? (["profile", userId] as const) : (["profile"] as const);
}

export function useProfile(userId?: string | null) {
  return useQuery({
    queryKey: profileQueryKey(userId),
    enabled: userId !== null,
    queryFn: async (): Promise<ProfileUser> => {
      const res = await api.api.profile.$get();
      if (!res.ok) throw new Error("load_failed");
      return (await res.json()).user as ProfileUser;
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

export function useUpdateProfileLocale(userId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ProfileLocaleUpdateInput) => {
      const res = await api.api.profile.locale.$patch({ json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).user as { locale: Locale };
    },
    onSuccess: (updated) => {
      qc.setQueryData<ProfileUser>(profileQueryKey(userId), (current) =>
        current ? { ...current, locale: updated.locale } : current,
      );
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
