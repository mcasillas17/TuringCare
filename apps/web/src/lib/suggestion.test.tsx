import { LocaleProvider, useI18n } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
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
import { weekKeyAtOffset } from "./week";

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

function SuggestionProbe({ weekKey }: { weekKey: string }) {
  const { locale, selectLocale } = useI18n();
  const { data } = useSuggestion("dog-1", weekKey, 420);

  return (
    <>
      <p>{data?.primary?.exercise ?? "loading"}</p>
      <button type="button" onClick={() => selectLocale(locale === "en" ? "es" : "en")}>
        switch
      </button>
    </>
  );
}

function expectPracticeDerivedInvalidations(invalidateQueries: unknown) {
  for (const queryKey of [
    ["progress", "dog-1"],
    ["contextual-progress", "dog-1"],
    ["focus", "dog-1"],
    ["suggestion", "dog-1"],
    ["overview"],
    ["dogs-overview"],
  ]) {
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey });
  }
}

afterEach(() => vi.clearAllMocks());

describe("suggestion hooks", () => {
  it("loads fresh localized suggestion prose after a locale switch", async () => {
    localStorage.setItem("tc-locale", "en");
    getSuggestion
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ suggestion: { primary: { exercise: "English exercise" } } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ suggestion: { primary: { exercise: "Ejercicio en español" } } }),
      });
    const queryClient = makeQueryClient();
    const weekKey = weekKeyAtOffset(new Date(), 420);

    render(
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <SuggestionProbe weekKey={weekKey} />
        </LocaleProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText("English exercise")).toBeInTheDocument();
    act(() => screen.getByRole("button", { name: "switch" }).click());

    expect(await screen.findByText("Ejercicio en español")).toBeInTheDocument();
    expect(getSuggestion).toHaveBeenCalledTimes(2);
  });

  it("only loads the current week's suggestion with timezone offset", async () => {
    getSuggestion.mockResolvedValue({ ok: true, json: async () => ({ suggestion: {} }) });
    const queryClient = makeQueryClient();
    const weekKey = weekKeyAtOffset(new Date(), 420);

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

  it("posts suggestion actions and invalidates the suggestion", async () => {
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
    });
  });

  it.each([
    ["action", { error: "suggestion_dismissed" }, "suggestion_dismissed"],
    ["action", {}, "action_failed"],
    ["decision", { error: "stale_proposal" }, "stale_proposal"],
    ["decision", {}, "decision_failed"],
  ])("preserves structured %s errors", async (mutation, failed, message) => {
    const queryClient = makeQueryClient();
    if (mutation === "action") {
      postAction.mockResolvedValue({ ok: false, json: async () => failed });
      const { result } = renderHook(() => useSuggestionAction("dog-1", "2026-08-10"), {
        wrapper: makeWrapper(queryClient),
      });
      await expect(
        result.current.mutateAsync({ suggestionId: "suggestion-1", action: "started" }),
      ).rejects.toThrow(message);
      return;
    }

    postDecision.mockResolvedValue({ ok: false, json: async () => failed });
    const { result } = renderHook(() => useAdvancementDecision("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });
    await expect(
      result.current.mutateAsync({ proposalId: "proposal-1", decision: "confirmed" }),
    ).rejects.toThrow(message);
  });

  it("posts advancement decisions and invalidates all practice-derived caches", async () => {
    postDecision.mockResolvedValue({ ok: true, json: async () => ({}) });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAdvancementDecision("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ proposalId: "proposal-1", decision: "confirmed" });
    });

    expect(postDecision).toHaveBeenCalledWith({
      param: { id: "dog-1", proposalId: "proposal-1" },
      json: { decision: "confirmed" },
    });
    expectPracticeDerivedInvalidations(invalidateQueries);
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: suggestionKey("dog-1", "2026-08-10"),
    });
  });
});
