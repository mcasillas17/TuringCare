import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getFocus, addFocus, removeFocus } = vi.hoisted(() => ({
  getFocus: vi.fn(),
  addFocus: vi.fn(),
  removeFocus: vi.fn(),
}));

vi.mock("./api", () => ({
  api: {
    api: {
      dogs: {
        ":id": {
          focus: {
            $get: getFocus,
            $post: addFocus,
            ":skillId": { $delete: removeFocus },
          },
        },
      },
    },
  },
}));

import { suggestionKey } from "./suggestion-key";
import { focusKey, useAddFocus, useFocusWeek, useRemoveFocus } from "./weekly-focus";

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

describe("weekly focus hooks", () => {
  it("loads the focus for a week with local timezone offsets", async () => {
    getFocus.mockResolvedValue({ ok: true, json: async () => ({ focusSkills: [] }) });
    const queryClient = makeQueryClient();

    renderHook(() => useFocusWeek("dog-1", "2026-08-10", 420, 480), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() =>
      expect(getFocus).toHaveBeenCalledWith({
        param: { id: "dog-1" },
        query: {
          weekKey: "2026-08-10",
          timezoneOffsetMinutes: "420",
          weekEndTimezoneOffsetMinutes: "480",
        },
      }),
    );
    expect(focusKey("dog-1", "2026-08-10")).toEqual(["focus", "dog-1", "2026-08-10"]);
    expect(suggestionKey("dog-1", "2026-08-10")).toEqual(["suggestion", "dog-1", "2026-08-10"]);
  });

  it("adds focus and invalidates its focus and suggestion caches", async () => {
    addFocus.mockResolvedValue({ ok: true, json: async () => ({}) });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAddFocus("dog-1", "2026-08-10"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("skill-1");
    });

    expect(addFocus).toHaveBeenCalledWith({
      param: { id: "dog-1" },
      json: { skillId: "skill-1", weekKey: "2026-08-10" },
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: focusKey("dog-1", "2026-08-10"),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: suggestionKey("dog-1", "2026-08-10"),
    });
  });

  it("removes focus and invalidates its focus and suggestion caches", async () => {
    removeFocus.mockResolvedValue({ ok: true, json: async () => ({}) });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useRemoveFocus("dog-1", "2026-08-10"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync("skill-1");
    });

    expect(removeFocus).toHaveBeenCalledWith({
      param: { id: "dog-1", skillId: "skill-1" },
      query: { weekKey: "2026-08-10" },
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: focusKey("dog-1", "2026-08-10"),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: suggestionKey("dog-1", "2026-08-10"),
    });
  });
});
