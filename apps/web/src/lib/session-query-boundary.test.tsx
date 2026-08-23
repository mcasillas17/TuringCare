import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionQueryBoundary, useSessionQueriesReady } from "./session-query-boundary";

const { sessionState, useSessionMock } = vi.hoisted(() => ({
  sessionState: { pending: false, userId: "u1" as string | null },
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

beforeEach(() => {
  sessionState.pending = false;
  sessionState.userId = "u1";
  useSessionMock.mockImplementation(() => ({
    data: sessionState.userId ? { user: { id: sessionState.userId } } : null,
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
});
