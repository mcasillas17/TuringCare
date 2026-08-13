import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { getSuggestion, postAction, postDecision } = vi.hoisted(() => ({
  getSuggestion: vi.fn(),
  postAction: vi.fn(),
  postDecision: vi.fn(),
}));

vi.mock("./api", () => ({
  api: {
    api: {
      dogs: {
        ":id": {
          suggestion: { $get: getSuggestion },
          suggestions: { ":suggestionId": { actions: { $post: postAction } } },
          "advancement-proposals": { ":proposalId": { decision: { $post: postDecision } } },
        },
      },
    },
  },
}));

import {
  suggestionKey,
  useAdvancementDecision,
  useSuggestion,
  useSuggestionAction,
} from "./suggestion";
import { weekKeyOf } from "./week";

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

describe("suggestion hooks", () => {
  it("only loads the current week's suggestion with timezone offset", async () => {
    getSuggestion.mockResolvedValue({ ok: true, json: async () => ({ suggestion: {} }) });
    const queryClient = makeQueryClient();
    const weekKey = weekKeyOf(new Date());

    renderHook(() => useSuggestion("dog-1", weekKey, 420), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() =>
      expect(getSuggestion).toHaveBeenCalledWith({
        param: { id: "dog-1" },
        query: { weekKey, timezoneOffsetMinutes: "420" },
      }),
    );
    expect(suggestionKey("dog-1", weekKey)).toEqual(["suggestion", "dog-1", weekKey]);

    renderHook(() => useSuggestion("dog-1", "2000-01-03", 420), {
      wrapper: makeWrapper(makeQueryClient()),
    });
    renderHook(() => useSuggestion("", weekKey, 420), {
      wrapper: makeWrapper(makeQueryClient()),
    });

    expect(getSuggestion).toHaveBeenCalledTimes(1);
  });

  it("posts suggestion actions and invalidates the exact suggestion", async () => {
    postAction.mockResolvedValue({ ok: true, json: async () => ({}) });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSuggestionAction("dog-1", "2026-08-10"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ suggestionId: "suggestion-1", action: "started" });
    });

    expect(postAction).toHaveBeenCalledWith({
      param: { id: "dog-1", suggestionId: "suggestion-1" },
      json: { action: "started" },
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: suggestionKey("dog-1", "2026-08-10"),
      exact: true,
    });
  });

  it("posts advancement decisions and invalidates all affected caches", async () => {
    postDecision.mockResolvedValue({ ok: true, json: async () => ({}) });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAdvancementDecision("dog-1", "2026-08-10"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ proposalId: "proposal-1", decision: "confirmed" });
    });

    expect(postDecision).toHaveBeenCalledWith({
      param: { id: "dog-1", proposalId: "proposal-1" },
      json: { decision: "confirmed" },
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: suggestionKey("dog-1", "2026-08-10"),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["progress", "dog-1"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["overview"] });
  });
});
