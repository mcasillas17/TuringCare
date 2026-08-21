import { LocaleProvider } from "@/i18n";
import * as contextualProgressLib from "@/lib/contextual-progress";
import * as progressLib from "@/lib/progress";
import * as suggestionLib from "@/lib/suggestion";
import { weekKeyOf } from "@/lib/week";
import * as focusLib from "@/lib/weekly-focus";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ContextualProgressSummary, TrainingSuggestion } from "@turingcare/shared";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DogWeek } from "./dog-week";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("@/lib/weekly-focus", async () => {
  const actual = await vi.importActual<typeof import("@/lib/weekly-focus")>("@/lib/weekly-focus");
  return {
    ...actual,
    useFocusWeek: vi.fn(),
    useAddFocus: vi.fn(),
    useRemoveFocus: vi.fn(),
  };
});
vi.mock("@/lib/contextual-progress", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contextual-progress")>(
    "@/lib/contextual-progress",
  );
  return { ...actual, useRecordContextualProgressEvent: vi.fn() };
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

const activeSafety = {
  suppressed: true as const,
  ruleId: "reported_injury_or_pain" as const,
  referral: "veterinarian" as const,
};

const safetySuggestion: TrainingSuggestion = {
  ...exerciseSuggestion,
  type: "safety_suppressed",
  ruleId: null,
  primary: null,
  fallback: null,
  safety: activeSafety,
};

function setup(
  focusSkills: focusLib.FocusSkill[],
  suggestion: TrainingSuggestion | undefined = exerciseSuggestion,
) {
  const focusRefetch = vi.fn().mockResolvedValue({});
  vi.mocked(focusLib.useFocusWeek).mockReturnValue({
    data: focusSkills,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: focusRefetch,
  } as unknown as ReturnType<typeof focusLib.useFocusWeek>);
  vi.mocked(focusLib.useAddFocus).mockReturnValue({
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof focusLib.useAddFocus>);
  vi.mocked(focusLib.useRemoveFocus).mockReturnValue({
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof focusLib.useRemoveFocus>);
  const recordEvent = vi.fn();
  vi.mocked(contextualProgressLib.useRecordContextualProgressEvent).mockReturnValue({
    mutate: recordEvent,
  } as never);
  vi.mocked(progressLib.useProgress).mockReturnValue({
    data: [
      {
        id: "g1",
        goal: "Basic manners",
        skills: [{ id: "s1", name: "Sit", confidence: 1 }],
      },
    ],
  } as unknown as ReturnType<typeof progressLib.useProgress>);
  const logMutate = vi.fn().mockResolvedValue({
    session: { id: "session-1" },
    anchorRejected: null,
  });
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
    isFetching: false,
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
  return { actionMutate, deleteMutate, evidenceMutate, focusRefetch, logMutate, recordEvent };
}

function weekElement(
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/my/dogs/d1/week"]}>
          <Routes>
            <Route path="/my/dogs/:id/week" element={<DogWeek />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>
  );
}

function renderWeek() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    ...render(weekElement(qc)),
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
  currentLevel: 1,
  dimensions: [],
  contextualProgress: {
    status: "ready",
    summary: { strongestContext: null, nextPracticeAction: null, safety: null },
  },
};

function focusWithSafety(): focusLib.FocusSkill {
  return {
    ...sitFocus,
    contextualProgress: {
      status: "ready",
      summary: {
        strongestContext: null,
        nextPracticeAction: null,
        safety: activeSafety,
      },
    },
  };
}

const reliableActionSummary: ContextualProgressSummary = {
  strongestContext: {
    context: {
      cueSupport: "verbal_cue",
      environment: "home_quiet",
      distance: "few_steps",
      durationBand: "about_15_seconds",
      distraction: "none",
    },
    status: "reliable",
    successfulDistinctDays: 2,
    latestOutcome: "went_well",
    lastObservedAt: "2026-08-20T12:00:00.000Z",
    lastSuccessfulAt: "2026-08-20T12:00:00.000Z",
  },
  nextPracticeAction: {
    ruleId: "advance_reliable_context",
    direction: "harder",
    context: {
      cueSupport: "verbal_cue",
      environment: "home_quiet",
      distance: "across_room",
      durationBand: "about_15_seconds",
      distraction: "none",
    },
    changedDimension: "distance",
  },
  safety: null,
};

function focusWithSafetyAndAction(): focusLib.FocusSkill[] {
  return [
    focusWithSafety(),
    {
      ...sitFocus,
      skillId: "s2",
      name: "Stay",
      contextualProgress: {
        status: "ready",
        summary: reliableActionSummary,
      },
    },
  ];
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("DogWeek", () => {
  it("shows retry and edit controls instead of a false empty state after focus failure", () => {
    const { focusRefetch } = setup([]);
    vi.mocked(focusLib.useFocusWeek).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: focusRefetch,
    } as unknown as ReturnType<typeof focusLib.useFocusWeek>);
    renderWeek();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Couldn't load this week's focus. Try again or edit your focus.",
    );
    expect(screen.queryByText("Pick one skill to focus on this week")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(focusRefetch).toHaveBeenCalledOnce();
    fireEvent.click(screen.getAllByRole("button", { name: "Edit focus" })[0] as HTMLElement);
    expect(screen.getByRole("radiogroup", { name: "Focus skill" })).toBeInTheDocument();
  });

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
    expect(screen.getAllByText("Recall").length).toBeGreaterThan(0);
    expect(screen.getByText("Reliability")).toBeInTheDocument();
  });

  it("renders a compact contextual summary above the practice grid", () => {
    setup([sitFocus]);
    renderWeek();

    expect(screen.getByRole("heading", { name: "Sit" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Add an outcome and context after practice to see where this skill is becoming reliable.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Log Sit on/i })[0]).toBeEnabled();
  });

  it("keeps the practice grid usable when contextual progress is unavailable", () => {
    const { focusRefetch } = setup([
      {
        ...sitFocus,
        contextualProgress: { status: "unavailable" },
      },
    ]);
    renderWeek();

    expect(screen.getByRole("status")).toHaveTextContent("Couldn't load context progress.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(focusRefetch).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "Sit", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all evidence" })).toHaveAttribute(
      "href",
      "/my/dogs/d1/training#skill-s1",
    );
    expect(screen.getAllByRole("button", { name: /Log Sit on/i })[0]).toBeEnabled();
  });

  it("does not reuse a previous week's focus controls after the focus scope changes", () => {
    const currentWeek = weekKeyOf(new Date());
    setup([
      {
        ...sitFocus,
        sessions: [
          { id: "session-1", occurredAt: new Date().toISOString(), durationMinutes: null },
        ],
      },
    ]);
    vi.mocked(focusLib.useFocusWeek).mockImplementation((_dogId, weekKey) =>
      weekKey === currentWeek
        ? ({
            data: [
              {
                ...sitFocus,
                sessions: [
                  { id: "session-1", occurredAt: new Date().toISOString(), durationMinutes: null },
                ],
              },
            ],
            isLoading: false,
            isError: false,
          } as unknown as ReturnType<typeof focusLib.useFocusWeek>)
        : ({
            data: undefined,
            isLoading: false,
            isError: true,
          } as unknown as ReturnType<typeof focusLib.useFocusWeek>),
    );
    renderWeek();

    expect(screen.getByRole("heading", { name: "Sit", level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Log Sit on/i })[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Sit on .*: 1 sessions/i }));
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log another/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Couldn't load this week's focus. Try again or edit your focus.",
    );
    expect(screen.getAllByRole("button", { name: "Edit focus" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Sit", level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Log Sit on/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /log another/i })).not.toBeInTheDocument();
  });

  it("shows neutral focus-load copy while cached focus controls remain usable", () => {
    setup([sitFocus]);
    vi.mocked(focusLib.useFocusWeek).mockReturnValue({
      data: [sitFocus],
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof focusLib.useFocusWeek>);
    renderWeek();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Couldn't load this week's focus. Try again or edit your focus.",
    );
    expect(screen.getAllByRole("button", { name: "Edit focus" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /Log Sit on/i })[0]).toBeEnabled();
  });

  it("announces focus loading without disabling saved practice controls", () => {
    setup([sitFocus]);
    vi.mocked(focusLib.useFocusWeek).mockReturnValue({
      data: [sitFocus],
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof focusLib.useFocusWeek>);
    renderWeek();

    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(screen.getAllByRole("button", { name: /Log Sit on/i })[0]).toBeEnabled();
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

  it("renders one referral alert when suggestion and summary share active safety", () => {
    setup([focusWithSafety()], safetySuggestion);
    renderWeek();

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText(/Please book a veterinary appointment/)).toBeInTheDocument();
  });

  it("owns one page-level safety alert when a contextual safety response is newer than a suggestion", () => {
    const { recordEvent } = setup(focusWithSafetyAndAction());
    renderWeek();

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText(/Please book a veterinary appointment/)).toBeInTheDocument();
    expect(screen.queryByText("Lure into a sit.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "We did this" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Use this practice plan" })).not.toBeInTheDocument();
    expect(
      recordEvent.mock.calls.some(([event]) => event.name === "training.context_next_action_used"),
    ).toBe(false);
    expect(
      recordEvent.mock.calls
        .filter(([event]) => event.name === "training.context_insight_viewed")
        .every(([event]) => event.hasNextAction === false),
    ).toBe(true);
  });

  it("keeps the summary referral alert when the weekly suggestion is unavailable", () => {
    setup([focusWithSafety()]);
    vi.mocked(suggestionLib.useSuggestion).mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
    } as unknown as ReturnType<typeof suggestionLib.useSuggestion>);
    renderWeek();

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByText(/Please book a veterinary appointment/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "We did this" })).not.toBeInTheDocument();
  });

  it.each(["suggestion", "focus"] as const)(
    "suppresses cached recommendation actions while the %s query is fetching",
    (fetchingQuery) => {
      setup(focusWithSafetyAndAction().slice(1));
      if (fetchingQuery === "suggestion") {
        vi.mocked(suggestionLib.useSuggestion).mockReturnValue({
          data: exerciseSuggestion,
          isLoading: false,
          isFetching: true,
          isError: false,
        } as unknown as ReturnType<typeof suggestionLib.useSuggestion>);
      } else {
        vi.mocked(focusLib.useFocusWeek).mockReturnValue({
          data: focusWithSafetyAndAction().slice(1),
          isLoading: false,
          isFetching: true,
          isError: false,
          refetch: vi.fn(),
        } as unknown as ReturnType<typeof focusLib.useFocusWeek>);
      }

      renderWeek();

      expect(screen.queryByText("Lure into a sit.")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "Use this practice plan" }),
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /Log .* on/i })[0]).toBeEnabled();
    },
  );

  it("restores safe recommendation actions after background fetching settles", () => {
    setup(focusWithSafetyAndAction().slice(1));
    let isFetching = true;
    vi.mocked(suggestionLib.useSuggestion).mockImplementation(
      () =>
        ({
          data: exerciseSuggestion,
          isLoading: false,
          isFetching,
          isError: false,
        }) as unknown as ReturnType<typeof suggestionLib.useSuggestion>,
    );
    const rendered = renderWeek();

    expect(screen.queryByText("Lure into a sit.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Use this practice plan" })).not.toBeInTheDocument();

    isFetching = false;
    rendered.rerender(weekElement(rendered.qc));

    expect(screen.getAllByText("Lure into a sit.")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Use this practice plan" })).toBeInTheDocument();
  });

  it("does not render cached suggestions on historical weeks", () => {
    setup([sitFocus]);
    renderWeek();

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));

    expect(screen.queryByText("This week's suggestion")).not.toBeInTheDocument();
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

  it("resets quick-capture answers when a different session is logged", async () => {
    const { logMutate } = setup([sitFocus]);
    logMutate
      .mockResolvedValueOnce({ session: { id: "session-1" }, anchorRejected: null })
      .mockResolvedValueOnce({ session: { id: "session-2" }, anchorRejected: null });
    renderWeek();

    const logButtons = screen.getAllByRole("button", { name: /Log Sit on/i });
    fireEvent.click(logButtons[0] as HTMLElement);
    const tooHard = await screen.findByRole("button", { name: "Too hard" });
    fireEvent.click(tooHard);
    expect(tooHard).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(logButtons[1] as HTMLElement);

    await waitFor(() => expect(logMutate).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Too hard" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Save response" })).toBeDisabled();
  });

  it("does not show a late session capture after the selected week changes", async () => {
    const pendingLog = deferred<{ id: string }>();
    const { logMutate } = setup([sitFocus]);
    logMutate.mockReturnValueOnce(pendingLog.promise);
    renderWeek();

    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    await act(async () => pendingLog.resolve({ id: "session-1" }));

    expect(screen.queryByText("How did it go?")).not.toBeInTheDocument();
  });

  it("does not clear a newer capture when an older evidence save finishes", async () => {
    const pendingEvidence = deferred<object>();
    const { evidenceMutate, logMutate } = setup([sitFocus]);
    evidenceMutate.mockReturnValueOnce(pendingEvidence.promise);
    logMutate
      .mockResolvedValueOnce({ session: { id: "session-1" }, anchorRejected: null })
      .mockResolvedValueOnce({ session: { id: "session-2" }, anchorRejected: null });
    renderWeek();

    const logButtons = screen.getAllByRole("button", { name: /Log Sit on/i });
    fireEvent.click(logButtons[0] as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "Went well" }));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.click(logButtons[1] as HTMLElement);
    await waitFor(() => expect(logMutate).toHaveBeenCalledTimes(2));

    await act(async () => pendingEvidence.resolve({}));

    expect(screen.getByText("How did it go?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save response" })).toBeDisabled();
  });

  it("disables logging while a session or required suggestion is loading", () => {
    setup([sitFocus]);
    vi.mocked(progressLib.useLogSession).mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    } as unknown as ReturnType<typeof progressLib.useLogSession>);
    const { unmount } = renderWeek();

    expect(screen.getAllByRole("button", { name: /Log Sit on/i })[0]).toBeDisabled();
    unmount();

    setup([sitFocus], undefined);
    vi.mocked(suggestionLib.useSuggestion).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as unknown as ReturnType<typeof suggestionLib.useSuggestion>);
    renderWeek();

    expect(screen.getAllByRole("button", { name: /Log Sit on/i })[0]).toBeDisabled();
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
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "I practiced this at the current Level 1.",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    await waitFor(() => expect(evidenceMutate).toHaveBeenCalled());
    expect(evidenceMutate.mock.calls[0]?.[0]?.body.practicedTarget).toBeUndefined();
    expect(evidenceMutate.mock.calls[0]?.[0]?.body.confirmCurrentLevel).toBe(true);
  });

  it("saves manual quick evidence without current-level confirmation", async () => {
    const { evidenceMutate } = setup(
      [
        {
          ...sitFocus,
          dimensions: ["distraction"],
        },
      ],
      { ...exerciseSuggestion, dismissed: true, requestedDimensions: ["distraction"] },
    );
    renderWeek();

    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "Went well" }));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    await waitFor(() => expect(evidenceMutate).toHaveBeenCalled());
    expect(evidenceMutate.mock.calls[0]?.[0]?.body.confirmCurrentLevel).toBeUndefined();
  });

  it("reports a saved practice when current-level confirmation is rejected", async () => {
    const { evidenceMutate } = setup([sitFocus]);
    evidenceMutate.mockResolvedValueOnce({ anchorRejected: "practice_day_required" });
    renderWeek();

    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "Went well" }));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    await waitFor(() => expect(evidenceMutate).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(
      "Practice was saved, but current-level confirmation was not recorded because this practice was not on a valid practice day.",
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("maps a locked anchor rejection without turning the saved practice into a failure", async () => {
    const { evidenceMutate } = setup([sitFocus]);
    evidenceMutate.mockResolvedValueOnce({ anchorRejected: "target_locked" });
    renderWeek();

    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);
    fireEvent.click(await screen.findByRole("button", { name: "Went well" }));
    fireEvent.click(screen.getByRole("button", { name: "Save response" }));

    await waitFor(() => expect(evidenceMutate).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(
      "Practice was saved, but current-level confirmation was not recorded because this practice already has a different training anchor.",
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows an error if a logged focus skill is no longer available", async () => {
    const focusSkills = [sitFocus];
    setup(focusSkills);
    renderWeek();
    focusSkills.length = 0;

    fireEvent.click(screen.getAllByRole("button", { name: /Log Sit on/i })[0] as HTMLElement);

    expect(toast.error).toHaveBeenCalledWith("Couldn't save");
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

  it("deletes a session through the progress mutation", async () => {
    const { deleteMutate } = setup([
      {
        ...sitFocus,
        sessions: [
          { id: "session-1", occurredAt: new Date().toISOString(), durationMinutes: null },
        ],
      },
    ]);
    renderWeek();

    fireEvent.click(screen.getByRole("button", { name: /Sit on .*: 1 sessions/i }));
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));

    await waitFor(() =>
      expect(deleteMutate).toHaveBeenCalledWith({ skillId: "s1", sessionId: "session-1" }),
    );
  });
});
