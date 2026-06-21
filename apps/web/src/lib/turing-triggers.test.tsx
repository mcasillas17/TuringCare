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
        },
      },
    },
  },
}));

import { useSendBrief } from "./brief-send";
import { useAddEntry } from "./journal";

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
