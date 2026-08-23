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

export function useProfile() {
  return useQuery({
    queryKey: ["profile"],
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

export function useUpdateProfileLocale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ProfileLocaleUpdateInput) => {
      const res = await api.api.profile.locale.$patch({ json: body });
      if (!res.ok) throw new Error("save_failed");
      return (await res.json()).user as { locale: Locale };
    },
    onSuccess: (updated) => {
      qc.setQueryData<ProfileUser>(["profile"], (current) =>
        current ? { ...current, locale: updated.locale } : current,
      );
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
