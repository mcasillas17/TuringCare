import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { signOut } from "./auth-client";

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return async (destination = "/login") => {
    const result = await signOut();
    if (result?.error) {
      throw result.error;
    }
    queryClient.clear();
    navigate(destination);
  };
}
