import { useMe } from "@/lib/me";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { data, isPending, isError } = useMe();
  if (isPending) return <p className="p-8">Loading…</p>;
  if (isError || data?.role !== "admin") return <Navigate to="/app" replace />;
  return <>{children}</>;
}
