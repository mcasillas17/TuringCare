import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { addConcern, removeConcern, deleteDog } = vi.hoisted(() => ({
  addConcern: vi.fn(),
  removeConcern: vi.fn(),
  deleteDog: vi.fn(),
}));

vi.mock("./api", () => ({
  api: {
    api: {
      dogs: {
        $get: vi.fn(),
        $post: vi.fn(),
        overview: { $get: vi.fn() },
        ":id": {
          $get: vi.fn(),
          $put: vi.fn(),
          $delete: deleteDog,
          concerns: {
            $post: addConcern,
            ":concernId": { $delete: removeConcern },
          },
          goals: {
            $post: vi.fn(),
            ":goalId": { $delete: vi.fn() },
          },
        },
      },
    },
  },
}));

import { useAddConcern, useDeleteDog, useRemoveConcern } from "./dogs";

let activeQueryClient: QueryClient | null = null;

function TestQueryClientProvider({ children }: { children: ReactNode }) {
  if (!activeQueryClient) throw new Error("test_query_client_not_initialized");
  return <QueryClientProvider client={activeQueryClient}>{children}</QueryClientProvider>;
}

function makeWrapper(queryClient: QueryClient) {
  activeQueryClient = queryClient;
  return TestQueryClientProvider;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function expectSafetyInvalidations(invalidateQueries: unknown) {
  for (const queryKey of [
    ["suggestion", "dog-1"],
    ["focus", "dog-1"],
    ["contextual-progress", "dog-1"],
  ]) {
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey });
  }
}

afterEach(() => vi.clearAllMocks());

describe("safety-producing dog hooks", () => {
  it("invalidates safety-derived data when a concern is added", async () => {
    addConcern.mockResolvedValue({
      ok: true,
      json: async () => ({ concern: { id: "concern-1" } }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAddConcern("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        concern: "Barking",
        severity: "moderate",
        safetySignal: null,
      });
    });

    expectSafetyInvalidations(invalidateQueries);
  });

  it("invalidates safety-derived data when a concern is removed", async () => {
    removeConcern.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useRemoveConcern("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("concern-1");
    });

    expectSafetyInvalidations(invalidateQueries);
  });

  it("invalidates safety-derived data when a dog is deleted", async () => {
    deleteDog.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteDog(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("dog-1");
    });

    expectSafetyInvalidations(invalidateQueries);
  });
});
