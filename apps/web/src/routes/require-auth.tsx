import { useSession } from "@/lib/auth-client";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  if (isPending) return <p className="p-8">Loading…</p>;
  if (!data) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
