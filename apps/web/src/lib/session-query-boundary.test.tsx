import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localeFetch } from "./api";
import {
  SessionQueryBoundary,
  useSessionQueriesReady,
  useSessionQueryReady,
} from "./session-query-boundary";
import { useHasVerifiedSession } from "./verified-session";

const { sessionState, useSessionMock } = vi.hoisted(() => ({
  sessionState: {
    pending: false,
    refetching: false,
    userId: "u1" as unknown,
    emailVerified: true,
    error: null as Error | null,
  },
  useSessionMock: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: useSessionMock,
}));

function BoundaryTree({
  children,
  queryClient,
}: { children: ReactNode; queryClient: QueryClient }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionQueryBoundary>{children}</SessionQueryBoundary>
    </QueryClientProvider>
  );
}

function PublicAndPrivateProbe() {
  const identityReady = useSessionQueriesReady();
  const queryClient = useQueryClient();
  const privateProfile = queryClient.getQueryData<{ marker: string }>(["profile", "owner"]);

  return (
    <>
      <p>public-route-content</p>
      {identityReady ? <p>{privateProfile?.marker ?? "private-cache-empty"}</p> : <p>sanitizing</p>}
    </>
  );
}

function TrainerContactProbe() {
  const identityReady = useSessionQueriesReady();
  const queryClient = useQueryClient();
  const trainer = queryClient.getQueryData<{ email: string; phone: string }>(["trainers", "t1"]);

  if (!identityReady) return <p>sanitizing</p>;
  return trainer ? <p>{`${trainer.email} ${trainer.phone}`}</p> : <p>trainer-cache-empty</p>;
}

function AnonymousIdentityProbe() {
  return <p>{useSessionQueryReady(null) ? "anonymous-ready" : "anonymous-not-ready"}</p>;
}

beforeEach(() => {
  sessionState.pending = false;
  sessionState.refetching = false;
  sessionState.userId = "u1";
  sessionState.emailVerified = true;
  sessionState.error = null;
  useSessionMock.mockImplementation(() => ({
    data:
      sessionState.userId === null
        ? null
        : { user: { id: sessionState.userId, emailVerified: sessionState.emailVerified } },
    isPending: sessionState.pending,
    isRefetching: sessionState.refetching,
    error: sessionState.error,
  }));
});

afterEach(() => {
  useSessionMock.mockReset();
  vi.unstubAllGlobals();
});

describe("SessionQueryBoundary", () => {
  it("hides prior privileged data while a cross-tab/focus session refresh is in flight", async () => {
    const queryClient = new QueryClient();
    const tree = () => (
      <BoundaryTree queryClient={queryClient}>
        <PublicAndPrivateProbe />
      </BoundaryTree>
    );
    const view = render(tree());
    await screen.findByText("private-cache-empty");
    queryClient.setQueryData(["profile", "owner"], { marker: "private-before-focus" });
    sessionState.refetching = true;
    view.rerender(tree());
    expect(screen.getByText("sanitizing")).toBeInTheDocument();
    expect(queryClient.getQueryData(["profile", "owner"])).toBeUndefined();
    sessionState.refetching = false;
    sessionState.userId = null;
    view.rerender(tree());
    await screen.findByText("private-cache-empty");
  });
  it("recovers a stale verified tab on an authoritative 403 and only unlocks after a fresh verified session", async () => {
    function AccessProbe() {
      return <p>{useHasVerifiedSession() ? "verified-access" : "verification-wall"}</p>;
    }
    const queryClient = new QueryClient();
    render(
      <BoundaryTree queryClient={queryClient}>
        <AccessProbe />
      </BoundaryTree>,
    );
    await screen.findByText("verified-access");
    queryClient.setQueryData(["private"], { secret: "stale" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "email_unverified" }, { status: 403 })),
    );
    await act(async () => {
      await localeFetch("/api/dogs");
    });
    expect(await screen.findByText("verification-wall")).toBeInTheDocument();
    expect(queryClient.getQueryData(["private"])).toBeUndefined();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ user: { id: "u1", emailVerified: true } })),
    );
    await act(async () => {
      await localeFetch("/api/auth/get-session?disableCookieCache=true");
    });
    expect(await screen.findByText("verified-access")).toBeInTheDocument();
  });
  it("clears private queries and mutations when verification changes on the SAME user", async () => {
    const queryClient = new QueryClient();
    const tree = () => (
      <BoundaryTree queryClient={queryClient}>
        <PublicAndPrivateProbe />
      </BoundaryTree>
    );
    const view = render(tree());
    await screen.findByText("private-cache-empty");
    queryClient.setQueryData(["profile", "owner"], { marker: "verified-secret" });
    queryClient.getMutationCache().build(queryClient, { mutationKey: ["private"] });
    sessionState.emailVerified = false;
    view.rerender(tree());
    await screen.findByText("private-cache-empty");
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0);
    queryClient.setQueryData(["profile", "owner"], { marker: "unverified-stale" });
    sessionState.emailVerified = true;
    view.rerender(tree());
    await screen.findByText("private-cache-empty");
  });

  it("clears stale privileged data when session refresh fails", async () => {
    const queryClient = new QueryClient();
    const tree = () => (
      <BoundaryTree queryClient={queryClient}>
        <PublicAndPrivateProbe />
      </BoundaryTree>
    );
    const view = render(tree());
    await screen.findByText("private-cache-empty");
    queryClient.setQueryData(["profile", "owner"], { marker: "private-secret" });
    sessionState.error = new Error("offline");
    view.rerender(tree());
    await waitFor(() => expect(queryClient.getQueryData(["profile", "owner"])).toBeUndefined());
    expect(screen.queryByText("private-secret")).not.toBeInTheDocument();
  });
  it("clears every cached query on user switch, logout, and login", async () => {
    const queryClient = new QueryClient();
    const tree = () => (
      <BoundaryTree queryClient={queryClient}>
        <PublicAndPrivateProbe />
      </BoundaryTree>
    );
    const view = render(tree());
    await screen.findByText("private-cache-empty");

    queryClient.setQueryData(["profile", "owner"], { marker: "profile-u1" });
    queryClient.setQueryData(["dogs-overview"], [{ marker: "dogs-u1" }]);
    queryClient.setQueryData(["overview"], { marker: "overview-u1" });
    queryClient.setQueryData(["guided-setup"], { marker: "setup-u1" });
    queryClient.setQueryData(["suggestion", "dog-u1", "2026-08-17", "en"], {
      marker: "suggestion-u1",
    });
    queryClient.setQueryData(["contextual-progress", "dog-u1"], {
      marker: "context-u1",
    });
    queryClient.setQueryData(["training-catalog", "en"], { marker: "public" });
    view.rerender(tree());
    expect(screen.getByText("profile-u1")).toBeInTheDocument();

    sessionState.userId = "u2";
    view.rerender(tree());
    expect(screen.getByText("public-route-content")).toBeInTheDocument();

    await waitFor(() => {
      expect(queryClient.getQueryData(["profile", "owner"])).toBeUndefined();
      expect(queryClient.getQueryData(["dogs-overview"])).toBeUndefined();
      expect(queryClient.getQueryData(["overview"])).toBeUndefined();
      expect(queryClient.getQueryData(["guided-setup"])).toBeUndefined();
      expect(
        queryClient.getQueryData(["suggestion", "dog-u1", "2026-08-17", "en"]),
      ).toBeUndefined();
      expect(queryClient.getQueryData(["contextual-progress", "dog-u1"])).toBeUndefined();
      expect(queryClient.getQueryData(["training-catalog", "en"])).toBeUndefined();
    });

    queryClient.setQueryData(["profile", "owner"], { marker: "profile-u2" });
    queryClient.setQueryData(["dogs-overview"], [{ marker: "dogs-u2" }]);
    queryClient.setQueryData(["overview"], { marker: "overview-u2" });
    sessionState.userId = null;
    view.rerender(tree());

    await waitFor(() => {
      expect(queryClient.getQueryData(["profile", "owner"])).toBeUndefined();
      expect(queryClient.getQueryData(["dogs-overview"])).toBeUndefined();
      expect(queryClient.getQueryData(["overview"])).toBeUndefined();
    });

    queryClient.setQueryData(["profile", "owner"], { marker: "signed-out-stale" });
    queryClient.setQueryData(["dogs-overview"], [{ marker: "signed-out-stale" }]);
    queryClient.setQueryData(["overview"], { marker: "signed-out-stale" });
    sessionState.userId = "u3";
    view.rerender(tree());

    await waitFor(() => {
      expect(queryClient.getQueryData(["profile", "owner"])).toBeUndefined();
      expect(queryClient.getQueryData(["dogs-overview"])).toBeUndefined();
      expect(queryClient.getQueryData(["overview"])).toBeUndefined();
    });
    expect(queryClient.getQueryData(["training-catalog", "en"])).toBeUndefined();
  });

  it("removes cached authenticated trainer contact details before anonymous rendering on logout", async () => {
    const queryClient = new QueryClient();
    const tree = () => (
      <BoundaryTree queryClient={queryClient}>
        <TrainerContactProbe />
      </BoundaryTree>
    );
    const view = render(tree());
    await screen.findByText("trainer-cache-empty");

    queryClient.setQueryData(["trainers", "t1"], {
      email: "private@example.com",
      phone: "+1-555-0100",
    });
    view.rerender(tree());
    expect(screen.getByText("private@example.com +1-555-0100")).toBeInTheDocument();

    sessionState.userId = null;
    view.rerender(tree());

    await screen.findByText("trainer-cache-empty");
    expect(screen.queryByText(/private@example\.com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/555-0100/)).not.toBeInTheDocument();
    expect(queryClient.getQueryData(["trainers", "t1"])).toBeUndefined();
  });

  it.each(["", "   ", 42])(
    "uses anonymous cache identity for the runtime-invalid session user id %j",
    async (userId) => {
      sessionState.userId = userId;
      const queryClient = new QueryClient();
      queryClient.setQueryData(["profile", "owner"], { marker: "private-profile" });

      render(
        <BoundaryTree queryClient={queryClient}>
          <AnonymousIdentityProbe />
        </BoundaryTree>,
      );

      await screen.findByText("anonymous-ready");
      expect(queryClient.getQueryData(["profile", "owner"])).toBeUndefined();
    },
  );
});
