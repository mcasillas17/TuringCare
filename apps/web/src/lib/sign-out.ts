import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { signOut } from "./auth-client";

export type SignOutResult = { ok: true } | { ok: false; error: unknown };

export type SignOutOptions = {
  destination?: string;
  navigateOnFailure?: boolean;
};

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return async ({
    destination = "/login",
    navigateOnFailure = false,
  }: SignOutOptions = {}): Promise<SignOutResult> => {
    let result: SignOutResult;
    try {
      const response = await signOut();
      result = response?.error ? { ok: false, error: response.error } : { ok: true };
    } catch (error) {
      result = { ok: false, error };
    }

    queryClient.clear();
    if (result.ok || navigateOnFailure) {
      navigate(destination);
    }
    return result;
  };
}
