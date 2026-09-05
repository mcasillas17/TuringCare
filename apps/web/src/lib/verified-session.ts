import { createContext, useContext } from "react";
import { useSession } from "./auth-client";
import { isNonemptySessionUserId } from "./session-user-id";

export const VerificationDeniedContext = createContext(false);

export function useHasVerifiedSession() {
  const { data, isPending, isRefetching, error } = useSession();
  const denied = useContext(VerificationDeniedContext);
  return (
    !isPending &&
    !isRefetching &&
    !error &&
    !denied &&
    isNonemptySessionUserId(data?.user?.id) &&
    data?.user.emailVerified === true
  );
}
