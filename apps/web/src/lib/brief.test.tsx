import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getBrief, generateBrief, finalizeBrief, shareBrief, revokeShare, celebrate } = vi.hoisted(
  () => ({
    getBrief: vi.fn(),
    generateBrief: vi.fn(),
    finalizeBrief: vi.fn(),
    shareBrief: vi.fn(),
    revokeShare: vi.fn(),
    celebrate: vi.fn(),
  }),
);

vi.mock("@/components/turing/turing-context", () => ({
  useTuring: () => ({ celebrate }),
}));

vi.mock("./api", () => ({
  api: {
    api: {
      dogs: {
        ":id": {
          brief: {
            $get: getBrief,
            $post: generateBrief,
            $put: finalizeBrief,
            share: {
              $post: shareBrief,
              $delete: revokeShare,
            },
          },
        },
      },
    },
  },
}));

import { useGenerateBrief, useRevokeShare, useShareBrief } from "./brief";

const briefKey = ["brief", "dog-1"] as const;

const sharedBrief = {
  id: "brief-shared",
  dogId: "dog-1",
  generatedAt: "2026-08-22T18:00:00.000Z",
  status: "finalized" as const,
  summary: "A previously shared Brief.",
  version: 4,
  shareToken: "shared-token",
};

const privateBrief = {
  id: "brief-private",
  dogId: "dog-1",
  generatedAt: "2026-08-22T19:00:00.000Z",
  status: "draft" as const,
  summary: "A newly generated private Brief.",
  version: 5,
  shareToken: null,
};

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

function ok<T>(body: T) {
  return { ok: true, json: async () => body };
}

function expectBriefInvalidation(invalidateQueries: unknown) {
  expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: briefKey });
}

afterEach(() => vi.clearAllMocks());

describe("Brief mutation cache updates", () => {
  it("replaces the cached shared Brief with the newly generated private Brief", async () => {
    generateBrief.mockResolvedValue(ok({ brief: privateBrief }));
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    queryClient.setQueryData(briefKey, sharedBrief);
    const { result } = renderHook(() => useGenerateBrief("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("30d");
    });

    expect(queryClient.getQueryData(briefKey)).toEqual(privateBrief);
    expectBriefInvalidation(invalidateQueries);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["overview"] });
  });

  it("merges a newly shared token into the cached Brief without changing its other fields", async () => {
    shareBrief.mockResolvedValue(
      ok({ token: "tok123", url: "https://turingcare.example/b/tok123" }),
    );
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    queryClient.setQueryData(briefKey, privateBrief);
    const { result } = renderHook(() => useShareBrief("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(queryClient.getQueryData(briefKey)).toEqual({ ...privateBrief, shareToken: "tok123" });
    expect(celebrate).toHaveBeenCalledWith(true, "turing.celebrateBrief");
    expectBriefInvalidation(invalidateQueries);
  });

  it("merges a revoked share into the cached Brief without changing its other fields", async () => {
    revokeShare.mockResolvedValue(ok({ ok: true }));
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    queryClient.setQueryData(briefKey, sharedBrief);
    const { result } = renderHook(() => useRevokeShare("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(queryClient.getQueryData(briefKey)).toEqual({ ...sharedBrief, shareToken: null });
    expectBriefInvalidation(invalidateQueries);
  });

  it.each([
    { action: "shares", cachedBrief: undefined, mutation: useShareBrief },
    { action: "shares", cachedBrief: null, mutation: useShareBrief },
    { action: "revokes", cachedBrief: undefined, mutation: useRevokeShare },
    { action: "revokes", cachedBrief: null, mutation: useRevokeShare },
  ])(
    "$action without fabricating a Brief when the cache is $cachedBrief",
    async ({ cachedBrief, mutation }) => {
      shareBrief.mockResolvedValue(
        ok({ token: "tok123", url: "https://turingcare.example/b/tok123" }),
      );
      revokeShare.mockResolvedValue(ok({ ok: true }));
      const queryClient = makeQueryClient();
      const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
      queryClient.setQueryData(briefKey, cachedBrief);
      const { result } = renderHook(() => mutation("dog-1"), {
        wrapper: makeWrapper(queryClient),
      });

      await act(async () => {
        await result.current.mutateAsync();
      });

      expect(queryClient.getQueryData(briefKey)).toBe(cachedBrief);
      expectBriefInvalidation(invalidateQueries);
    },
  );
});
