import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data, isPending, isError } = useQuery({
    queryKey: ["me", "admin"],
    retry: false,
    queryFn: async () => {
      const res = await api.me.$get();
      if (!res.ok) throw new Error("unauthorized");
      return (await res.json()) as { user: { role?: string } };
    },
  });

  if (isPending) return <p className="p-8">Loading…</p>;
  if (isError || data?.user?.role !== "admin") return <Navigate to="/app" replace />;
  return <>{children}</>;
}
