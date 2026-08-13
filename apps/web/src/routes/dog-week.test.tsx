import { LocaleProvider } from "@/i18n";
import * as progressLib from "@/lib/progress";
import * as suggestionLib from "@/lib/suggestion";
import { weekKeyOf } from "@/lib/week";
import * as focusLib from "@/lib/weekly-focus";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TrainingSuggestion } from "@turingcare/shared";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DogWeek } from "./dog-week";

vi.mock("@/lib/weekly-focus", async () => {
  const actual = await vi.importActual<typeof import("@/lib/weekly-focus")>("@/lib/weekly-focus");
  return {
    ...actual,
    useFocusWeek: vi.fn(),
    useAddFocus: vi.fn(),
    useRemoveFocus: vi.fn(),
  };
});
vi.mock("@/lib/progress", () => ({
  useProgress: vi.fn(),
  useLogSession: vi.fn(),
  useDeleteSession: vi.fn(),
  useSetSessionEvidence: vi.fn(),
}));
vi.mock("@/lib/suggestion", () => ({
  suggestionKey: (dogId: string, weekKey: string) => ["suggestion", dogId, weekKey],
  useSuggestion: vi.fn(),
  useSuggestionAction: vi.fn(),
  useAdvancementDecision: vi.fn(),
}));

const exerciseSuggestion: TrainingSuggestion = {
  suggestionId: "sug-1",
  dismissed: false,
  type: "exercise",
  ruleId: "cold_start_curriculum_level",
  curriculumVersion: "2026-08-11",
  dogId: "d1",
  weekKey: weekKeyOf(new Date()),
  skill: {
    id: "s1",
    name: "Sit",
    catalogSkillKey: "basic-manners.sit",
    level: 1,
    goalId: "g1",
    goalName: "Basic manners",
  },
  primary: { level: 1, exercise: "Lure into a sit.", dimension: "cue_support" },
  fallback: {
    level: 1,
    exercise: "Lure into a sit.",
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

function setup(
  focusSkills: focusLib.FocusSkill[],
  suggestion: TrainingSuggestion | undefined = exerciseSuggestion,
) {
  vi.mocked(focusLib.useFocusWeek).mockReturnValue({
    data: focusSkills,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof focusLib.useFocusWeek>);
  vi.mocked(focusLib.useAddFocus).mockReturnValue({
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof focusLib.useAddFocus>);
  vi.mocked(focusLib.useRemoveFocus).mockReturnValue({
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof focusLib.useRemoveFocus>);
  vi.mocked(progressLib.useProgress).mockReturnValue({
    data: [
      {
        id: "g1",
        goal: "Basic manners",
        skills: [{ id: "s1", name: "Sit", confidence: 1 }],
      },
    ],
  } as unknown as ReturnType<typeof progressLib.useProgress>);
  const logMutate = vi.fn().mockResolvedValue({ id: "session-1" });
  const deleteMutate = vi.fn().mockResolvedValue({});
  const evidenceMutate = vi.fn().mockResolvedValue({});
  vi.mocked(progressLib.useLogSession).mockReturnValue({
    mutateAsync: logMutate,
  } as unknown as ReturnType<typeof progressLib.useLogSession>);
  vi.mocked(progressLib.useDeleteSession).mockReturnValue({
    mutateAsync: deleteMutate,
  } as unknown as ReturnType<typeof progressLib.useDeleteSession>);
  vi.mocked(progressLib.useSetSessionEvidence).mockReturnValue({
    mutateAsync: evidenceMutate,
    isPending: false,
  } as unknown as ReturnType<typeof progressLib.useSetSessionEvidence>);
  const actionMutate = vi.fn().mockResolvedValue({});
  vi.mocked(suggestionLib.useSuggestion).mockReturnValue({
    data: suggestion,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof suggestionLib.useSuggestion>);
  vi.mocked(suggestionLib.useSuggestionAction).mockReturnValue({
    mutateAsync: actionMutate,
    isPending: false,
  } as unknown as ReturnType<typeof suggestionLib.useSuggestionAction>);
  vi.mocked(suggestionLib.useAdvancementDecision).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  } as unknown as ReturnType<typeof suggestionLib.useAdvancementDecision>);
  return { actionMutate, deleteMutate, evidenceMutate, logMutate };
}

function renderWeek() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    ...render(
      <QueryClientProvider client={qc}>
        <LocaleProvider>
          <MemoryRouter initialEntries={["/my/dogs/d1/week"]}>
            <Routes>
              <Route path="/my/dogs/:id/week" element={<DogWeek />} />
            </Routes>
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    ),
    qc,
  };
}

const sitFocus: focusLib.FocusSkill = {
  skillId: "s1",
  name: "Sit",
  goalId: "g1",
  goalName: "Basic manners",
  position: 0,
  sessions: [],
};

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("DogWeek", () => {
  it("shows the pick-focus empty state when there are no focus skills", () => {
    setup([]);
    renderWeek();
    expect(screen.getByText(/Pick one skill to focus on this week/i)).toBeInTheDocument();
  });

  it("renders a focus skill row and its goal", () => {
    setup([
      {
        ...sitFocus,
        name: "Recall",
        goalName: "Reliability",
      },
    ]);
    renderWeek();
    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getByText("Reliability")).toBeInTheDocument();
  });

  it("logs a session with the selected day's instant and timezone offset", async () => {
    const { logMutate } = setup(
      [
        {
          ...sitFocus,
          name: "Recall",
        },
      ],
      undefined,
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T16:30:00.000Z"));
    renderWeek();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Log Recall on 2026-08-10" }));
    });
    const occurredAt = new Date(2026, 7, 10, 12, 0, 0);
    expect(logMutate).toHaveBeenCalledWith({
      skillId: "s1",
      body: {
        occurredAt: occurredAt.toISOString(),
        timezoneOffsetMinutes: occurredAt.getTimezoneOffset(),
      },
    });
  });

  it("renders an undismissed weekly suggestion above the grid", () => {
    setup([sitFocus]);
    renderWeek();
    expect(screen.getByText("This week's suggestion")).toBeInTheDocument();
    expect(screen.getAllByText("Lure into a sit.")).toHaveLength(2);
  });

  it("queries only the current week using the current timezone offset", () => {
    setup([sitFocus]);
    renderWeek();

    expect(suggestionLib.useSuggestion).toHaveBeenCalledWith(
      "d1",
      weekKeyOf(new Date()),
      new Date().getTimezoneOffset(),
    );
  });

  it("shows a non-blocking error and still logs when the suggestion query fails", async () => {
    const { logMutate } = setup([sitFocus]);
    vi.mocked(suggestionLib.useSuggestion).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof suggestionLib.useSuggestion>);
    renderWeek();

    expect(screen.getByRole("status")).toHaveTextContent(/load this week's suggestion/i);
    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    await waitFor(() => expect(logMutate).toHaveBeenCalled());
  });

  it("captures evidence anchored to the matching current suggestion after grid logging", async () => {
    const { evidenceMutate } = setup([sitFocus]);
    renderWeek();

    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "Too hard" }));
    fireEvent.click(screen.getByRole("radio", { name: "Easier fallback" }));
    fireEvent.change(screen.getByLabelText("What else was going on?"), {
      target: { value: "strong" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /unsafe/i }), {
      target: { value: "aggression_or_bite_risk" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    await waitFor(() =>
      expect(evidenceMutate).toHaveBeenCalledWith({
        skillId: "s1",
        sessionId: "session-1",
        body: {
          outcome: "too_hard",
          distraction: "strong",
          safetySignal: "aggression_or_bite_risk",
          practicedTarget: { suggestionId: "sug-1", variant: "fallback" },
        },
      }),
    );
  });

  it("keeps a saved session and the confirmed safety report available after an evidence failure", async () => {
    const { evidenceMutate, logMutate } = setup([sitFocus]);
    evidenceMutate.mockRejectedValueOnce(new Error("temporary"));
    renderWeek();

    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    fireEvent.change(await screen.findByRole("combobox", { name: /unsafe/i }), {
      target: { value: "injury_or_pain" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /confirm/i }));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    await waitFor(() => expect(evidenceMutate).toHaveBeenCalledTimes(1));
    expect(logMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Save response" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));
    await waitFor(() => expect(evidenceMutate).toHaveBeenCalledTimes(2));
  });

  it("does not anchor quick evidence to a dismissed suggestion", async () => {
    const { evidenceMutate } = setup([sitFocus], { ...exerciseSuggestion, dismissed: true });
    renderWeek();

    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "Went well" }));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    await waitFor(() => expect(evidenceMutate).toHaveBeenCalled());
    expect(evidenceMutate.mock.calls[0]?.[0]?.body.practicedTarget).toBeUndefined();
  });

  it("records suggestion actions and opens the focus picker on request", async () => {
    const { actionMutate } = setup([sitFocus]);
    renderWeek();

    fireEvent.click(screen.getByRole("button", { name: "We did this" }));
    await waitFor(() =>
      expect(actionMutate).toHaveBeenCalledWith({ suggestionId: "sug-1", action: "started" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose a different focus" }));
    expect(screen.getByRole("radiogroup", { name: "Focus skill" })).toBeInTheDocument();
  });

  it("invalidates the exact weekly suggestion after deleting a session", async () => {
    setup([
      {
        ...sitFocus,
        sessions: [
          { id: "session-1", occurredAt: new Date().toISOString(), durationMinutes: null },
        ],
      },
    ]);
    const { qc } = renderWeek();
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    fireEvent.click(screen.getByRole("button", { name: /Sit on .*: 1 sessions/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["suggestion", "d1", expect.any(String)],
      }),
    );
  });
});
