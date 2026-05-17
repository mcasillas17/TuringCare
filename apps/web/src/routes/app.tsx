import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { signOut } from "@/lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export function AppHome() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await api.me.$get();
      if (!res.ok) throw new Error("unauthorized");
      return res.json();
    },
  });

  return (
    <div className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Your dashboard</h1>
      {isLoading ? (
        <p>Loading…</p>
      ) : (
        <pre className="bg-muted p-4 rounded text-sm">{JSON.stringify(data, null, 2)}</pre>
      )}
      <Button
        variant="outline"
        onClick={async () => {
          await signOut();
          toast.success("Signed out");
          navigate("/login");
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
