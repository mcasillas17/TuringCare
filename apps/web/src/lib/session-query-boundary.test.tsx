import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SessionQueryBoundary,
  useSessionQueriesReady,
  useSessionQueryReady,
} from "./session-query-boundary";

const { sessionState, useSessionMock } = vi.hoisted(() => ({
  sessionState: { pending: false, userId: "u1" as unknown },
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
  sessionState.userId = "u1";
  useSessionMock.mockImplementation(() => ({
    data: sessionState.userId === null ? null : { user: { id: sessionState.userId } },
    isPending: sessionState.pending,
  }));
});

afterEach(() => {
  useSessionMock.mockReset();
});

describe("SessionQueryBoundary", () => {
  it("clears private profile, dogs, and overview cache on user switch, logout, and login", async () => {
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
    });
    expect(queryClient.getQueryData(["training-catalog", "en"])).toEqual({ marker: "public" });

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
    expect(queryClient.getQueryData(["training-catalog", "en"])).toEqual({ marker: "public" });
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
