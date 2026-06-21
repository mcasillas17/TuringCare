import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const celebrate = vi.fn();

vi.mock("@/components/turing/turing-context", () => ({
  useTuring: () => ({ eventPose: null, asleep: false, celebrate }),
}));

// journal.ts: const dogJournal = api.api.dogs[":id"].journal
// useAddEntry calls: dogJournal.$post({ param: { id: dogId }, json: body })
vi.mock("@/lib/api", () => ({
  api: {
    api: {
      dogs: {
        $post: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ dog: { id: "d2" } }) }),
        ":id": {
          journal: {
            $post: vi
              .fn()
              .mockResolvedValue({ ok: true, json: async () => ({ entry: { id: "e1" } }) }),
          },
          brief: {
            send: {
              $post: vi
                .fn()
                .mockResolvedValue({ ok: true, json: async () => ({ send: { id: "s1" } }) }),
            },
          },
          goals: {
            $post: vi
              .fn()
              .mockResolvedValue({ ok: true, json: async () => ({ goal: { id: "g1" } }) }),
          },
          skills: {
            ":skillId": {
              confidence: {
                $patch: vi
                  .fn()
                  .mockResolvedValue({ ok: true, json: async () => ({ skill: { id: "sk1" } }) }),
              },
            },
          },
        },
      },
    },
  },
}));

import { useSendBrief } from "./brief-send";
import { useAddGoal, useCreateDog } from "./dogs";
import { useAddEntry } from "./journal";
import { useUpdateSkillConfidence } from "./progress";

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

afterEach(() => vi.clearAllMocks());

describe("turing celebrate triggers", () => {
  it("journal save fires a small wag (celebrate(false))", async () => {
    const { result } = renderHook(() => useAddEntry("d1"), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ kind: "moment", note: "good sit" } as never);
    });
    await waitFor(() => expect(celebrate).toHaveBeenCalledWith(false));
  });

  it("send brief fires a big hop (celebrate(true))", async () => {
    const { result } = renderHook(() => useSendBrief("d1"), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ recipientEmail: "vet@example.com" } as never);
    });
    await waitFor(() => expect(celebrate).toHaveBeenCalledWith(true));
  });

  it("add dog fires a big hop", async () => {
    const { result } = renderHook(() => useCreateDog(), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ name: "Rex" } as never);
    });
    await waitFor(() => expect(celebrate).toHaveBeenCalledWith(true));
  });

  it("add goal fires a small wag", async () => {
    const { result } = renderHook(() => useAddGoal("d1"), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ title: "Loose-leash walking" } as never);
    });
    await waitFor(() => expect(celebrate).toHaveBeenCalledWith(false));
  });

  it("reaching max confidence hops; a lower bump wags", async () => {
    const { result } = renderHook(() => useUpdateSkillConfidence("d1"), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutateAsync({ skillId: "s1", body: { confidence: 5 } });
    });
    await waitFor(() => expect(celebrate).toHaveBeenCalledWith(true));
    celebrate.mockClear();
    await act(async () => {
      await result.current.mutateAsync({ skillId: "s1", body: { confidence: 3 } });
    });
    await waitFor(() => expect(celebrate).toHaveBeenCalledWith(false));
  });

  it("journal error does NOT call celebrate", async () => {
    const { api } = await import("@/lib/api");
    const mockPost = api.api.dogs[":id"].journal.$post as ReturnType<typeof vi.fn>;
    mockPost.mockResolvedValueOnce({ ok: false, json: async () => ({}) });

    const { result } = renderHook(() => useAddEntry("d1"), { wrapper: makeWrapper() });
    await act(async () => {
      await result.current.mutate({ kind: "moment", note: "bad" } as never);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(celebrate).not.toHaveBeenCalled();
  });
});
