import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { addEntry, updateEntry, deleteEntry } = vi.hoisted(() => ({
  addEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));

vi.mock("@/components/turing/turing-context", () => ({
  useTuring: () => ({ celebrate: vi.fn() }),
}));

vi.mock("./api", () => ({
  api: {
    api: {
      journal: { $get: vi.fn() },
      dogs: {
        ":id": {
          journal: {
            $get: vi.fn(),
            $post: addEntry,
            ":entryId": {
              $put: updateEntry,
              $delete: deleteEntry,
            },
          },
        },
      },
    },
  },
}));

import { useAddEntry, useDeleteEntry, useUpdateEntry } from "./journal";

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
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

describe("journal mutation hooks", () => {
  it("invalidates safety-derived data when a journal entry is added", async () => {
    addEntry.mockResolvedValue({
      ok: true,
      json: async () => ({ entry: { id: "entry-1" } }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAddEntry("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ kind: "moment", note: "A calm moment." });
    });

    expectSafetyInvalidations(invalidateQueries);
  });

  it("invalidates safety-derived data when a journal entry is updated", async () => {
    updateEntry.mockResolvedValue({
      ok: true,
      json: async () => ({ entry: { id: "entry-1" } }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUpdateEntry("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        entryId: "entry-1",
        body: { note: "A calmer moment." },
      });
    });

    expectSafetyInvalidations(invalidateQueries);
  });

  it("invalidates safety-derived data when a journal entry is deleted", async () => {
    deleteEntry.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteEntry("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("entry-1");
    });

    expectSafetyInvalidations(invalidateQueries);
  });
});
