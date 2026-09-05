import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type Me = { id: string; name: string; email: string; role?: string; emailVerified: boolean };

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    retry: false,
    select: (user: Me): Me => ({
      ...user,
      role: user.emailVerified === true ? user.role : "user",
    }),
    queryFn: async (): Promise<Me> => {
      const res = await api.me.$get();
      if (!res.ok) throw new Error("unauthorized");
      return (await res.json()).user as Me;
    },
  });
}
