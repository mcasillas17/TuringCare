import { LocaleProvider } from "@/i18n";
import { suggestionKey } from "@/lib/suggestion";
import { weekKeyOf } from "@/lib/week";
import { focusKey } from "@/lib/weekly-focus";
import type { FocusSkill } from "@/lib/weekly-focus";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TrainingSuggestion } from "@turingcare/shared";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DogWeek } from "./dog-week";

const { getFocus, getSuggestion, patchEvidence, postSession } = vi.hoisted(() => ({
  getFocus: vi.fn(),
  getSuggestion: vi.fn(),
  patchEvidence: vi.fn(),
  postSession: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    api: {
      dogs: {
        ":id": {
          focus: { $get: getFocus },
          suggestion: { $get: getSuggestion },
          skills: {
            ":skillId": {
              sessions: {
                $post: postSession,
                ":sessionId": { evidence: { $patch: patchEvidence } },
              },
            },
          },
        },
      },
    },
  },
}));

const weekKey = weekKeyOf(new Date());

const focusSkill: FocusSkill = {
  skillId: "skill-1",
  name: "Sit",
  goalId: "goal-1",
  goalName: "Basic manners",
  position: 0,
  sessions: [],
  currentLevel: 1,
  dimensions: ["distraction"],
  contextualProgress: { status: "unavailable" },
};

const focusSkillWithSafety: FocusSkill = {
  ...focusSkill,
  contextualProgress: {
    status: "ready",
    summary: {
      strongestContext: null,
      nextPracticeAction: null,
      safety: {
        suppressed: true,
        ruleId: "reported_injury_or_pain",
        referral: "veterinarian",
      },
    },
  },
};

const suggestion: TrainingSuggestion = {
  suggestionId: "suggestion-1",
  dismissed: false,
  type: "exercise",
  ruleId: "cold_start_curriculum_level",
  curriculumVersion: "2026-08-11",
  dogId: "dog-1",
  weekKey,
  skill: {
    id: "skill-1",
    name: "Sit",
    catalogSkillKey: "basic-manners.sit",
    level: 1,
    goalId: "goal-1",
    goalName: "Basic manners",
  },
  primary: {
    level: 1,
    exercise: "Lure into a sit.",
    dimension: "cue_support",
  },
  fallback: {
    level: 1,
    exercise: "Lure into a sit with extra help.",
    reducedDimension: "cue_support",
    sameLevelEasing: true,
    easingStrategy: "add_cue_help",
  },
  requestedDimensions: ["distraction"],
  evidenceCategory: "curriculum_only",
  evidence: {
    windowDays: 21,
    sessionCount: 0,
    wentWellCount: 0,
    mixedCount: 0,
    tooHardCount: 0,
    distinctDayCount: 0,
    lastPracticeAt: null,
  },
  safety: null,
  advancementProposal: null,
};

function response(body: unknown) {
  return { ok: true, json: async () => body };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function renderWeek(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/my/dogs/dog-1/week"]}>
          <Routes>
            <Route path="/my/dogs/:id/week" element={<DogWeek />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.clearAllMocks());

describe("DogWeek audited suggestion cache authority", () => {
  it("keeps a settled audited exercise eligible after the log mutation awaits its refetches", async () => {
    const refreshedFocus = deferred<ReturnType<typeof response>>();
    const refreshedSuggestion = deferred<ReturnType<typeof response>>();
    getFocus
      .mockResolvedValueOnce(response({ focusSkills: [focusSkill] }))
      .mockImplementationOnce(() => refreshedFocus.promise);
    getSuggestion
      .mockResolvedValueOnce(response({ suggestion }))
      .mockImplementationOnce(() => refreshedSuggestion.promise);
    postSession.mockResolvedValue(response({ session: { id: "session-1" }, anchorRejected: null }));
    patchEvidence.mockResolvedValue(response({ anchorRejected: null }));
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });

    renderWeek(queryClient);

    await waitFor(() =>
      expect(queryClient.getQueryState(focusKey("dog-1", weekKey))).toMatchObject({
        fetchStatus: "idle",
        status: "success",
      }),
    );
    await waitFor(() =>
      expect(queryClient.getQueryState(suggestionKey("dog-1", weekKey))).toMatchObject({
        fetchStatus: "idle",
        status: "success",
      }),
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);

    await waitFor(() => expect(getFocus).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getSuggestion).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Lure into a sit.")).not.toBeInTheDocument());

    refreshedFocus.resolve(response({ focusSkills: [focusSkill] }));
    refreshedSuggestion.resolve(response({ suggestion }));

    await waitFor(() =>
      expect(queryClient.getQueryState(focusKey("dog-1", weekKey))).toMatchObject({
        fetchStatus: "idle",
        status: "success",
      }),
    );
    await waitFor(() =>
      expect(queryClient.getQueryState(suggestionKey("dog-1", weekKey))).toMatchObject({
        fetchStatus: "idle",
        status: "success",
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Went well" }));
    fireEvent.click(screen.getByRole("radio", { name: "Easier fallback" }));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    await waitFor(() =>
      expect(patchEvidence).toHaveBeenCalledWith({
        param: { id: "dog-1", skillId: "skill-1", sessionId: "session-1" },
        json: {
          outcome: "went_well",
          practicedTarget: { suggestionId: "suggestion-1", variant: "fallback" },
        },
      }),
    );
  });

  it("downgrades to manual capture when safety appears in the awaited focus refetch", async () => {
    getFocus
      .mockResolvedValueOnce(response({ focusSkills: [focusSkill] }))
      .mockResolvedValueOnce(response({ focusSkills: [focusSkillWithSafety] }));
    getSuggestion
      .mockResolvedValueOnce(response({ suggestion }))
      .mockResolvedValueOnce(response({ suggestion }));
    postSession.mockResolvedValue(response({ session: { id: "session-1" }, anchorRejected: null }));
    patchEvidence.mockResolvedValue(response({ anchorRejected: null }));
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });

    renderWeek(queryClient);

    await waitFor(() => expect(screen.getByText("Lure into a sit.")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "Went well" }));

    const currentLevelConfirmation = screen.getByRole("checkbox", {
      name: "I practiced this at the current Level 1.",
    });
    fireEvent.click(currentLevelConfirmation);
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    await waitFor(() =>
      expect(patchEvidence).toHaveBeenCalledWith({
        param: { id: "dog-1", skillId: "skill-1", sessionId: "session-1" },
        json: { confirmCurrentLevel: true, outcome: "went_well" },
      }),
    );
  });

  it("downgrades to manual capture when an awaited suggestion refetch errors", async () => {
    getFocus
      .mockResolvedValueOnce(response({ focusSkills: [focusSkill] }))
      .mockResolvedValueOnce(response({ focusSkills: [focusSkill] }));
    getSuggestion
      .mockResolvedValueOnce(response({ suggestion }))
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "load_failed" }) });
    postSession.mockResolvedValue(response({ session: { id: "session-1" }, anchorRejected: null }));
    patchEvidence.mockResolvedValue(response({ anchorRejected: null }));
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });

    renderWeek(queryClient);

    await waitFor(() => expect(screen.getByText("Lure into a sit.")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "Went well" }));

    const currentLevelConfirmation = screen.getByRole("checkbox", {
      name: "I practiced this at the current Level 1.",
    });
    fireEvent.click(currentLevelConfirmation);
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    await waitFor(() =>
      expect(patchEvidence).toHaveBeenCalledWith({
        param: { id: "dog-1", skillId: "skill-1", sessionId: "session-1" },
        json: { confirmCurrentLevel: true, outcome: "went_well" },
      }),
    );
  });

  it("removes an audited target when safety changes after capture and before evidence save", async () => {
    getFocus.mockResolvedValue(response({ focusSkills: [focusSkill] }));
    getSuggestion.mockResolvedValue(response({ suggestion }));
    postSession.mockResolvedValue(response({ session: { id: "session-1" }, anchorRejected: null }));
    patchEvidence.mockResolvedValue(response({ anchorRejected: null }));
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
    });

    renderWeek(queryClient);

    await waitFor(() => expect(screen.getByText("Lure into a sit.")).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    await screen.findByRole("radio", { name: "Easier fallback" });

    queryClient.setQueryData(focusKey("dog-1", weekKey), [focusSkillWithSafety]);

    fireEvent.click(screen.getByRole("button", { name: "Went well" }));
    const currentLevelConfirmation = await screen.findByRole("checkbox", {
      name: "I practiced this at the current Level 1.",
    });
    fireEvent.click(currentLevelConfirmation);
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    await waitFor(() =>
      expect(patchEvidence).toHaveBeenCalledWith({
        param: { id: "dog-1", skillId: "skill-1", sessionId: "session-1" },
        json: { confirmCurrentLevel: true, outcome: "went_well" },
      }),
    );
  });
});
