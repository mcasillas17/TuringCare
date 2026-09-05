import { createContext, useContext } from "react";
import { useSession } from "./auth-client";
import { isNonemptySessionUserId } from "./session-user-id";

export const VerificationDeniedContext = createContext(false);

export function useHasVerifiedSession() {
  const { data, error } = useSession();
  const denied = useContext(VerificationDeniedContext);
  return (
    !error &&
    !denied &&
    isNonemptySessionUserId(data?.user?.id) &&
    data?.user.emailVerified === true
  );
}
