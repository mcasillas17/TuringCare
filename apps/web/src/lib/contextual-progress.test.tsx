import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const {
  getContextualProgress,
  postContextualProgressEvent,
  postSession,
  patchEvidence,
  deleteSession,
  setSkillLevel,
} = vi.hoisted(() => ({
  getContextualProgress: vi.fn(),
  postContextualProgressEvent: vi.fn(),
  postSession: vi.fn(),
  patchEvidence: vi.fn(),
  deleteSession: vi.fn(),
  setSkillLevel: vi.fn(),
}));

vi.mock("@/components/turing/turing-context", () => ({
  useTuring: () => ({ celebrate: vi.fn() }),
}));

vi.mock("./api", () => ({
  api: {
    api: {
      dogs: {
        ":id": {
          "contextual-progress": {
            events: { $post: postContextualProgressEvent },
          },
          skills: {
            ":skillId": {
              "contextual-progress": { $get: getContextualProgress },
              level: { $put: setSkillLevel },
              sessions: {
                $post: postSession,
                ":sessionId": {
                  $delete: deleteSession,
                  evidence: { $patch: patchEvidence },
                },
              },
            },
          },
        },
      },
    },
  },
}));

import type { ContextualProgressEvent } from "@turingcare/shared";
import {
  contextualProgressDogKey,
  contextualProgressKey,
  useContextualProgress,
  useRecordContextualProgressEvent,
} from "./contextual-progress";
import {
  useDeleteSession,
  useLogSession,
  useSetSessionEvidence,
  useSetSkillLevel,
} from "./progress";

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

function expectPracticeDerivedInvalidations(invalidateQueries: unknown) {
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["progress", "dog-1"],
  });
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["contextual-progress", "dog-1"],
  });
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["focus", "dog-1"],
  });
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["suggestion", "dog-1"],
  });
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["overview"],
  });
  expect(invalidateQueries).toHaveBeenCalledWith({
    queryKey: ["dogs-overview"],
  });
}

afterEach(() => vi.clearAllMocks());

describe("contextual progress keys", () => {
  it("uses stable dog and skill detail keys", () => {
    expect(contextualProgressKey("d1", "s1")).toEqual(["contextual-progress", "d1", "s1"]);
    expect(contextualProgressDogKey("d1")).toEqual(["contextual-progress", "d1"]);
  });
});

describe("contextual progress hooks", () => {
  it("does not load detail while disabled", async () => {
    const queryClient = makeQueryClient();

    renderHook(() => useContextualProgress("dog-1", "skill-1", false), {
      wrapper: makeWrapper(queryClient),
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(getContextualProgress).not.toHaveBeenCalled();
  });

  it("loads typed detail and sends the exact skill parameters when enabled", async () => {
    getContextualProgress.mockResolvedValue({
      ok: true,
      json: async () => ({
        window: {
          startsAt: "2026-07-30T12:00:00.000Z",
          endsAt: "2026-08-20T12:00:00.000Z",
          days: 21,
        },
        curriculumLevel: 2,
        curriculumVersion: "2026-08-11",
        policyVersion: "2026-08-20",
        strongestContext: null,
        nextPracticeAction: null,
        exactContexts: [],
      }),
    });
    const queryClient = makeQueryClient();

    const { result } = renderHook(() => useContextualProgress("dog-1", "skill-1", true), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.data?.curriculumLevel).toBe(2));
    expect(getContextualProgress).toHaveBeenCalledWith({
      param: { id: "dog-1", skillId: "skill-1" },
    });
  });

  it("throws the contextual detail error when the typed GET fails", async () => {
    getContextualProgress.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "not_found" }),
    });
    const queryClient = makeQueryClient();

    const { result } = renderHook(() => useContextualProgress("dog-1", "skill-1", true), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() =>
      expect(result.current.error?.message).toBe("contextual_progress_load_failed"),
    );
  });

  it.each([
    {
      name: "training.context_insight_viewed",
      surface: "week",
      strongestStatus: "developing",
      hasNextAction: true,
    },
    {
      name: "training.context_next_action_used",
      surface: "skill_detail",
      ruleId: "repeat_developing_context",
      direction: "repeat",
    },
  ] satisfies ContextualProgressEvent[])(
    "records $name with the shared event payload",
    async (event) => {
      postContextualProgressEvent.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      });
      const { result } = renderHook(() => useRecordContextualProgressEvent("dog-1"), {
        wrapper: makeWrapper(makeQueryClient()),
      });

      await act(async () => {
        await result.current.mutateAsync(event);
      });

      expect(postContextualProgressEvent).toHaveBeenCalledWith({
        param: { id: "dog-1" },
        json: event,
      });
    },
  );
});

describe("practice-derived cache invalidation", () => {
  it("invalidates every derived cache after logging a session", async () => {
    postSession.mockResolvedValue({
      ok: true,
      json: async () => ({ session: { id: "session-1" } }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useLogSession("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        skillId: "skill-1",
        body: { occurredAt: "2026-08-13T12:00:00.000Z" },
      });
    });

    expectPracticeDerivedInvalidations(invalidateQueries);
  });

  it("invalidates every derived cache after updating evidence", async () => {
    patchEvidence.mockResolvedValue({
      ok: true,
      json: async () => ({ session: { id: "session-1" } }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSetSessionEvidence("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        skillId: "skill-1",
        sessionId: "session-1",
        body: { outcome: "went_well" },
      });
    });

    expectPracticeDerivedInvalidations(invalidateQueries);
  });

  it("invalidates every derived cache after deleting a session", async () => {
    deleteSession.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useDeleteSession("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ skillId: "skill-1", sessionId: "session-1" });
    });

    expectPracticeDerivedInvalidations(invalidateQueries);
  });

  it("invalidates every derived cache after changing a skill level", async () => {
    setSkillLevel.mockResolvedValue({
      ok: true,
      json: async () => ({ skill: { id: "skill-1" } }),
    });
    const queryClient = makeQueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useSetSkillLevel("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({ skillId: "skill-1", level: 3 });
    });

    expectPracticeDerivedInvalidations(invalidateQueries);
  });

  it("waits for every derived cache invalidation before resolving a skill-level mutation", async () => {
    setSkillLevel.mockResolvedValue({
      ok: true,
      json: async () => ({ skill: { id: "skill-1" } }),
    });
    const queryClient = makeQueryClient();
    let releaseInvalidation!: () => void;
    const invalidation = new Promise<void>((resolve) => {
      releaseInvalidation = resolve;
    });
    const invalidateQueries = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockReturnValue(invalidation);
    const { result } = renderHook(() => useSetSkillLevel("dog-1"), {
      wrapper: makeWrapper(queryClient),
    });

    let resolved = false;
    const mutation = result.current.mutateAsync({ skillId: "skill-1", level: 3 }).then(() => {
      resolved = true;
    });

    await waitFor(() => expect(invalidateQueries).toHaveBeenCalled());
    expect(resolved).toBe(false);

    releaseInvalidation();
    await act(async () => {
      await mutation;
    });
    expect(resolved).toBe(true);
  });
});
