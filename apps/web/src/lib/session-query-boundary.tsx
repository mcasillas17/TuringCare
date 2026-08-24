import { useSession } from "@/lib/auth-client";
import { isNonemptySessionUserId } from "@/lib/session-user-id";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";

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
  const { data: session, isPending } = useSession();
  const sessionUserId = sessionUserIdFromSession(session);
  const nextIdentity: IdentityState = isPending ? UNRESOLVED_IDENTITY : sessionUserId;
  const [clearedIdentity, setClearedIdentity] = useState<IdentityState>(UNRESOLVED_IDENTITY);
  const identityReady = nextIdentity !== UNRESOLVED_IDENTITY && clearedIdentity === nextIdentity;

  useEffect(() => {
    if (nextIdentity === UNRESOLVED_IDENTITY || nextIdentity === clearedIdentity) return;

    void queryClient.cancelQueries();
    queryClient.removeQueries();
    queryClient.getMutationCache().clear();
    setClearedIdentity(nextIdentity);
  }, [clearedIdentity, nextIdentity, queryClient]);

  const value = useMemo(() => ({ identityReady, sessionUserId }), [identityReady, sessionUserId]);

  return <SessionQueryContext.Provider value={value}>{children}</SessionQueryContext.Provider>;
}

export function useSessionQueryReady(expectedUserId: string | null): boolean {
  const state = useContext(SessionQueryContext);
  if (!state) return true;
  return state.identityReady && state.sessionUserId === expectedUserId;
}

export function useSessionQueriesReady(): boolean {
  return useContext(SessionQueryContext)?.identityReady ?? true;
}
