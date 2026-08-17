import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  getGuidedSetup,
  startGuidedSetup,
  saveIntent,
  completeBehavior,
  completeTraining,
  completeProgress,
  skipGuidedSetup,
  abandonGuidedSetup,
} = vi.hoisted(() => ({
  getGuidedSetup: vi.fn(),
  startGuidedSetup: vi.fn(),
  saveIntent: vi.fn(),
  completeBehavior: vi.fn(),
  completeTraining: vi.fn(),
  completeProgress: vi.fn(),
  skipGuidedSetup: vi.fn(),
  abandonGuidedSetup: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    api: {
      "guided-setup": {
        $get: getGuidedSetup,
        $post: startGuidedSetup,
        intent: { $put: saveIntent },
        skip: { $post: skipGuidedSetup },
        abandon: { $post: abandonGuidedSetup },
        action: {
          behavior: { $post: completeBehavior },
          training: { $post: completeTraining },
          progress: { $post: completeProgress },
        },
      },
    },
  },
}));

import {
  guidedSetupKey,
  useAbandonGuidedSetup,
  useCompleteBehaviorSetup,
  useCompleteProgressSetup,
  useCompleteTrainingSetup,
  useGuidedSetup,
  useSaveGuidedSetupIntent,
  useSkipGuidedSetup,
  useStartGuidedSetup,
} from "@/lib/guided-setup";

const setupId = "00000000-0000-4000-8000-000000000001";
const dogId = "dog-1";
const weekKey = "2026-08-10";

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

function setupRecord(dogIdValue: string | null = dogId) {
  return {
    id: setupId,
    dogId: dogIdValue,
    dogName: dogIdValue ? "Biscuit" : null,
    currentStep: "action" as const,
    intent: "train_skill" as const,
    startedAt: "2026-08-16T00:00:00.000Z",
    completedAt: "2026-08-16T00:01:00.000Z",
    completionReason: "first_action_completed" as const,
    firstActionType: "training" as const,
    firstActionId: "goal-1",
  };
}

function expectAggregateInvalidations(invalidateQueries: unknown) {
  for (const queryKey of [
    guidedSetupKey,
    ["dogs"],
    ["dogs-overview"],
    ["overview"],
    ["onboarding"],
    ["journal"],
  ]) {
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey });
  }
}

afterEach(() => vi.clearAllMocks());

describe("guided setup hooks", () => {
  it("loads guided setup status and preserves structured errors", async () => {
    getGuidedSetup.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "unauthorized" }),
    });
    const { result } = renderHook(() => useGuidedSetup(), {
      wrapper: makeWrapper(makeQueryClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error("unauthorized"));
    expect(getGuidedSetup).toHaveBeenCalledWith();
  });

  it("propagates invalid JSON instead of swallowing the parser error", async () => {
    const parseError = new SyntaxError("invalid json");
    getGuidedSetup.mockResolvedValue({
      ok: false,
      json: async () => {
        throw parseError;
      },
    });
    const { result } = renderHook(() => useGuidedSetup(), {
      wrapper: makeWrapper(makeQueryClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(parseError);
  });

  it("starts setup with dog profile data and invalidates aggregate caches", async () => {
    startGuidedSetup.mockResolvedValue({
      ok: true,
      json: async () => ({ setup: setupRecord() }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useStartGuidedSetup(), {
      wrapper: makeWrapper(queryClient),
    });
    const body = {
      name: "Biscuit",
      size: "medium" as const,
      sex: "female" as const,
      spayedNeutered: false,
      source: "rescue" as const,
      vaccineStage: "in_progress" as const,
    };

    await act(async () => {
      await result.current.mutateAsync(body);
    });

    expect(startGuidedSetup).toHaveBeenCalledWith({ json: body });
    expectAggregateInvalidations(invalidateQueries);
  });

  it("saves intent with setupId and invalidates aggregate caches", async () => {
    saveIntent.mockResolvedValue({
      ok: true,
      json: async () => ({ setup: setupRecord() }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSaveGuidedSetupIntent(), {
      wrapper: makeWrapper(queryClient),
    });
    const body = { setupId, intent: "train_skill" as const };

    await act(async () => {
      await result.current.mutateAsync(body);
    });

    expect(saveIntent).toHaveBeenCalledWith({ json: body });
    expectAggregateInvalidations(invalidateQueries);
  });

  it.each([
    ["skip", skipGuidedSetup, useSkipGuidedSetup],
    ["abandon", abandonGuidedSetup, useAbandonGuidedSetup],
  ] as const)("sends setupId when %s is completed", async (_name, endpoint, useHook) => {
    endpoint.mockResolvedValue({
      ok: true,
      json: async () => ({ setup: setupRecord() }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useHook(), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ setupId });
    });

    expect(endpoint).toHaveBeenCalledWith({ json: { setupId } });
    expectAggregateInvalidations(invalidateQueries);
  });

  it("narrows a behavior tombstone through actionDeleted and avoids null dog keys", async () => {
    completeBehavior.mockResolvedValue({
      ok: true,
      json: async () => ({
        setup: setupRecord(null),
        concern: null,
        actionDeleted: true,
      }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCompleteBehaviorSetup(), {
      wrapper: makeWrapper(queryClient),
    });
    const body = {
      setupId,
      concern: "Barking at the window",
      severity: "mild" as const,
      safetyConfirmed: false,
    };

    const response = await act(async () => result.current.mutateAsync(body));

    if (response.actionDeleted) {
      expect(response.concern).toBeNull();
    } else {
      expect(response.concern.id).toBeDefined();
    }
    expect(completeBehavior).toHaveBeenCalledWith({ json: body });
    expectAggregateInvalidations(invalidateQueries);
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ["dog-journal", null],
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["progress", null] });
  });

  it("completes a behavior action with setupId and dog cache invalidation", async () => {
    completeBehavior.mockResolvedValue({
      ok: true,
      json: async () => ({
        setup: setupRecord(),
        concern: { id: "concern-1" },
        actionDeleted: false,
      }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCompleteBehaviorSetup(), {
      wrapper: makeWrapper(queryClient),
    });
    const body = {
      setupId,
      concern: "Barking at the window",
      severity: "mild" as const,
      safetyConfirmed: false,
    };

    await act(async () => {
      await result.current.mutateAsync(body);
    });

    expect(completeBehavior).toHaveBeenCalledWith({ json: body });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["dog-journal", dogId] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["progress", dogId] });
  });

  it("narrows a progress tombstone and does not invalidate a null dog key", async () => {
    completeProgress.mockResolvedValue({
      ok: true,
      json: async () => ({
        setup: setupRecord(null),
        entry: null,
        actionDeleted: true,
      }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCompleteProgressSetup(), {
      wrapper: makeWrapper(queryClient),
    });
    const body = { setupId, trend: "better" as const, note: "Settled faster." };

    const response = await act(async () => result.current.mutateAsync(body));

    if (response.actionDeleted) {
      expect(response.entry).toBeNull();
    } else {
      expect(response.entry.id).toBeDefined();
    }
    expect(completeProgress).toHaveBeenCalledWith({ json: body });
    expectAggregateInvalidations(invalidateQueries);
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["dog-journal", null] });
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["progress", null] });
  });

  it("completes progress with setupId and dog cache invalidation", async () => {
    completeProgress.mockResolvedValue({
      ok: true,
      json: async () => ({
        setup: setupRecord(),
        entry: { id: "entry-1" },
        actionDeleted: false,
      }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCompleteProgressSetup(), {
      wrapper: makeWrapper(queryClient),
    });
    const body = { setupId, trend: "better" as const, note: "Settled faster." };

    await act(async () => {
      await result.current.mutateAsync(body);
    });

    expect(completeProgress).toHaveBeenCalledWith({ json: body });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["dog-journal", dogId] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["progress", dogId] });
  });

  it("completes training with setupId, week, offset, and all affected caches", async () => {
    completeTraining.mockResolvedValue({
      ok: true,
      json: async () => ({
        setup: setupRecord(),
        goal: { id: "goal-1" },
        skills: [],
        focus: { id: "focus-1" },
        suggestion: { suggestionId: "suggestion-1" },
        actionDeleted: false,
      }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCompleteTrainingSetup(), {
      wrapper: makeWrapper(queryClient),
    });
    const body = {
      setupId,
      templateKey: "puppy-fundamentals",
      weekKey,
      timezoneOffsetMinutes: 420,
    };

    const response = await act(async () => result.current.mutateAsync(body));

    if (response.actionDeleted) {
      expect(response.goal).toBeNull();
      expect(response.focus).toBeNull();
      expect(response.suggestion).toBeNull();
    } else {
      expect(response.goal.id).toBeDefined();
      expect(response.focus).not.toBeNull();
      expect(response.suggestion.suggestionId).toBeDefined();
    }
    expect(completeTraining).toHaveBeenCalledWith({ json: body });
    expectAggregateInvalidations(invalidateQueries);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["dog-journal", dogId] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["progress", dogId] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["focus", dogId, weekKey] });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["suggestion", dogId, weekKey],
    });
  });

  it("invalidates only aggregate caches for a deleted training tombstone", async () => {
    completeTraining.mockResolvedValue({
      ok: true,
      json: async () => ({
        setup: setupRecord(null),
        goal: null,
        skills: [],
        focus: null,
        suggestion: null,
        actionDeleted: true,
      }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCompleteTrainingSetup(), {
      wrapper: makeWrapper(queryClient),
    });
    const body = {
      setupId,
      templateKey: "puppy-fundamentals",
      weekKey,
      timezoneOffsetMinutes: 420,
    };

    const response = await act(async () => result.current.mutateAsync(body));

    if (response.actionDeleted) {
      expect(response.goal).toBeNull();
      expect(response.focus).toBeNull();
      expect(response.suggestion).toBeNull();
    }
    expect(completeTraining).toHaveBeenCalledWith({ json: body });
    expectAggregateInvalidations(invalidateQueries);
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ["dog-journal", null],
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({ queryKey: ["progress", null] });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ["focus", null, weekKey],
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ["suggestion", null, weekKey],
    });
  });

  it("throws the structured mutation error returned by the API", async () => {
    completeTraining.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "historical_suggestion_unavailable" }),
    });
    const { result } = renderHook(() => useCompleteTrainingSetup(), {
      wrapper: makeWrapper(makeQueryClient()),
    });

    await expect(
      result.current.mutateAsync({
        setupId,
        templateKey: "puppy-fundamentals",
        weekKey,
        timezoneOffsetMinutes: 420,
      }),
    ).rejects.toThrow("historical_suggestion_unavailable");
  });
});
