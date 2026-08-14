import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { postSession, patchEvidence } = vi.hoisted(() => ({
  postSession: vi.fn(),
  patchEvidence: vi.fn(),
}));

vi.mock("@/components/turing/turing-context", () => ({
  useTuring: () => ({ celebrate: vi.fn() }),
}));

vi.mock("./api", () => ({
  api: {
    api: {
      dogs: {
        ":id": {
          progress: { $get: vi.fn() },
          goals: { ":goalId": { skills: { $post: vi.fn() } } },
          skills: {
            ":skillId": {
              $put: vi.fn(),
              $delete: vi.fn(),
              level: { $put: vi.fn() },
              sessions: {
                $post: postSession,
                ":sessionId": { $delete: vi.fn(), evidence: { $patch: patchEvidence } },
              },
            },
          },
        },
      },
    },
  },
}));

import { useLogSession, useSetSessionEvidence } from "./progress";

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

afterEach(() => vi.clearAllMocks());

describe("progress hooks", () => {
  it("patches session evidence and invalidates derived progress and suggestions", async () => {
    patchEvidence.mockResolvedValue({
      ok: true,
      json: async () => ({ session: { id: "session-1" } }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSetSessionEvidence("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });
    const body = { outcome: "went_well" as const };

    await act(async () => {
      await result.current.mutateAsync({ skillId: "skill-1", sessionId: "session-1", body });
    });

    expect(patchEvidence).toHaveBeenCalledWith({
      param: { id: "dog-1", skillId: "skill-1", sessionId: "session-1" },
      json: body,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["progress", "dog-1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["suggestion", "dog-1"] });
  });

  it.each([
    [{ error: "session_limit_reached" }, "session_limit_reached"],
    [{}, "save_failed"],
  ])("preserves API errors when logging sessions", async (failed, message) => {
    postSession.mockResolvedValue({ ok: false, json: async () => failed });
    const { result } = renderHook(() => useLogSession("dog-1"), {
      wrapper: makeWrapper(makeQueryClient()),
    });

    await expect(
      result.current.mutateAsync({
        skillId: "skill-1",
        body: { occurredAt: "2026-08-13T12:00:00.000Z" },
      }),
    ).rejects.toThrow(message);
  });
});
