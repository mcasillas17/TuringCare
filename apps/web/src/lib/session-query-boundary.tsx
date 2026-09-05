import { useSession } from "@/lib/auth-client";
import { isNonemptySessionUserId } from "@/lib/session-user-id";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { EMAIL_UNVERIFIED_EVENT, VERIFIED_SESSION_EVENT } from "./auth-access-events";
import { VerificationDeniedContext } from "./verified-session";

const UNRESOLVED_IDENTITY = Symbol("unresolved-session-identity");
type ResolvedIdentity = string | null;
type IdentityState = ResolvedIdentity | typeof UNRESOLVED_IDENTITY;

type SessionQueryState = {
  identityReady: boolean;
  sessionUserId: ResolvedIdentity;
};

const SessionQueryContext = createContext<SessionQueryState | null>(null);

function sessionUserIdFromSession(session: unknown): ResolvedIdentity {
  if (!session || typeof session !== "object" || !("user" in session)) return null;
  const user = session.user;
  if (!user || typeof user !== "object" || !("id" in user)) return null;
  return isNonemptySessionUserId(user.id) ? user.id : null;
}

export function SessionQueryBoundary({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data: session, isPending, isRefetching, error } = useSession();
  const sessionUserId = sessionUserIdFromSession(session);
  const [deniedUserId, setDeniedUserId] = useState<string | null>(null);
  const denied = sessionUserId !== null && deniedUserId === sessionUserId;
  useEffect(() => {
    const deny = () => setDeniedUserId(sessionUserId);
    const verify = () => setDeniedUserId(null);
    window.addEventListener(EMAIL_UNVERIFIED_EVENT, deny);
    window.addEventListener(VERIFIED_SESSION_EVENT, verify);
    return () => {
      window.removeEventListener(EMAIL_UNVERIFIED_EVENT, deny);
      window.removeEventListener(VERIFIED_SESSION_EVENT, verify);
    };
  }, [sessionUserId]);
  const verified = session?.user.emailVerified === true;
  const nextIdentity: IdentityState = isPending
    ? UNRESOLVED_IDENTITY
    : JSON.stringify([sessionUserId, verified, denied, Boolean(error), Boolean(isRefetching)]);
  const [clearedIdentity, setClearedIdentity] = useState<IdentityState>(UNRESOLVED_IDENTITY);
  const identityReady =
    !error &&
    !isRefetching &&
    nextIdentity !== UNRESOLVED_IDENTITY &&
    clearedIdentity === nextIdentity;

  useEffect(() => {
    if (nextIdentity === UNRESOLVED_IDENTITY || nextIdentity === clearedIdentity) return;

    void queryClient.cancelQueries();
    queryClient.removeQueries();
    queryClient.getMutationCache().clear();
    setClearedIdentity(nextIdentity);
  }, [clearedIdentity, nextIdentity, queryClient]);

  const value = useMemo(() => ({ identityReady, sessionUserId }), [identityReady, sessionUserId]);

  return (
    <VerificationDeniedContext.Provider value={denied}>
      <SessionQueryContext.Provider value={value}>{children}</SessionQueryContext.Provider>
    </VerificationDeniedContext.Provider>
  );
}

export function useSessionQueryReady(expectedUserId: string | null): boolean {
  const state = useContext(SessionQueryContext);
  if (!state) return true;
  return state.identityReady && state.sessionUserId === expectedUserId;
}

export function useSessionQueriesReady(): boolean {
  return useContext(SessionQueryContext)?.identityReady ?? true;
}
