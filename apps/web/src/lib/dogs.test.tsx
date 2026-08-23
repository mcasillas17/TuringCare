import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { deleteDog } = vi.hoisted(() => ({ deleteDog: vi.fn() }));

vi.mock("./api", () => ({
  api: {
    api: {
      dogs: {
        ":id": {
          $delete: deleteDog,
        },
      },
    },
  },
}));

import { useDeleteDog } from "./dogs";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

afterEach(() => vi.clearAllMocks());

describe("useDeleteDog", () => {
  it.each([
    [{ error: "active_guided_setup" }, "active_guided_setup"],
    [{}, "delete_failed"],
    [{ error: "" }, "delete_failed"],
    ["not json", "delete_failed"],
  ])("throws the structured error or fallback for %j", async (body, expected) => {
    deleteDog.mockResolvedValueOnce({
      ok: false,
      json: async () => body,
    });
    const { result } = renderHook(() => useDeleteDog(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync("dog-1");
      }),
    ).rejects.toThrow(expected);
  });

  it("falls back when the failed response cannot be parsed", async () => {
    deleteDog.mockResolvedValueOnce({
      ok: false,
      json: async () => {
        throw new SyntaxError("invalid json");
      },
    });
    const { result } = renderHook(() => useDeleteDog(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync("dog-1");
      }),
    ).rejects.toThrow("delete_failed");
  });
});
