import { LocaleProvider } from "@/i18n";
import * as contextualProgressLib from "@/lib/contextual-progress";
import * as dogsLib from "@/lib/dogs";
import * as progressLib from "@/lib/progress";
import type { ProgressGoal } from "@/lib/progress";
import * as catalogLib from "@/lib/training-catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CatalogTemplate, ContextualProgress, SuggestionSafety } from "@turingcare/shared";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProgressPanel } from "./progress-panel";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const originalFocus = HTMLElement.prototype.focus;

vi.mock("@/lib/progress", async () => {
  const actual = await vi.importActual<typeof import("@/lib/progress")>("@/lib/progress");
  return {
    ...actual,
    useProgress: vi.fn(),
    useAddSkill: vi.fn(),
    useUpdateSkill: vi.fn(),
    useDeleteSkill: vi.fn(),
    useDeleteSession: vi.fn(),
    useSetSkillLevel: vi.fn(),
    useLogSession: vi.fn(),
  };
});
vi.mock("@/lib/training-catalog", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/training-catalog")>("@/lib/training-catalog");
  return { ...actual, useTrainingCatalog: vi.fn() };
});
vi.mock("@/lib/dogs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dogs")>("@/lib/dogs");
  return { ...actual, useRemoveGoal: vi.fn() };
});
vi.mock("@/lib/contextual-progress", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contextual-progress")>(
    "@/lib/contextual-progress",
  );
  return { ...actual, useContextualProgress: vi.fn(), useRecordContextualProgressEvent: vi.fn() };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

afterEach(() => {
  window.history.replaceState({}, "", "/");
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: originalScrollIntoView,
  });
  Object.defineProperty(HTMLElement.prototype, "focus", {
    configurable: true,
    value: originalFocus,
  });
  vi.restoreAllMocks();
});

function HashNavigator() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate("/my/dogs/d1/training#skill-s1")}>
      Open Sit
    </button>
  );
}

const goals: ProgressGoal[] = [
  {
    id: "g1",
    goal: "Basic Manners",
    catalogGoalKey: null,
    avgConfidence: 3,
    skills: [
      {
        id: "s1",
        name: "Sit",
        confidence: 3,
        position: 0,
        catalogSkillKey: null,
        sessionCount: 0,
        firstSessionAt: null,
        lastSessionAt: null,
        lastNote: null,
        sessions: [],
        milestones: [],
      },
    ],
  },
];

const goalsWithTwoSkills: ProgressGoal[] = goals.map((goal) => ({
  ...goal,
  skills: [
    ...goal.skills,
    {
      id: "s2",
      name: "Stay",
      confidence: 2,
      position: 1,
      catalogSkillKey: null,
      sessionCount: 0,
      firstSessionAt: null,
      lastSessionAt: null,
      lastNote: null,
      sessions: [],
      milestones: [],
    },
  ],
}));

const catalog: CatalogTemplate[] = [
  {
    key: "manners",
    name: "Manners",
    description: "Manners",
    skills: [
      {
        key: "sit",
        name: "Sit",
        description: "Sit",
        levels: [
          { level: 1, description: "Start" },
          { level: 2, description: "Build" },
          { level: 3, description: "Practice" },
          { level: 4, description: "Stretch" },
          { level: 5, description: "Solid" },
        ],
        dimensions: ["distraction"],
        levelSteps: ["distraction", "distraction", "distraction", "distraction"],
        levelStepStrategies: [
          "reduce_distractions",
          "reduce_distractions",
          "reduce_distractions",
          "reduce_distractions",
        ],
        baseEase: { dimension: "distraction", strategy: "reduce_distractions" },
      },
    ],
  },
];

const contextualData: ContextualProgress = {
  window: {
    startsAt: "2026-07-30T12:00:00.000Z",
    endsAt: "2026-08-20T12:00:00.000Z",
    days: 21,
  },
  curriculumLevel: 3,
  curriculumVersion: "2026-08-11",
  policyVersion: "2026-08-20",
  strongestContext: {
    context: {
      cueSupport: null,
      environment: "busy_outdoor",
      distance: null,
      durationBand: null,
      distraction: "mild",
    },
    status: "developing",
    successfulDistinctDays: 1,
    latestOutcome: "mixed",
    lastObservedAt: "2026-08-20T12:00:00.000Z",
    lastSuccessfulAt: "2026-08-20T12:00:00.000Z",
  },
  nextPracticeAction: {
    ruleId: "repeat_developing_context",
    direction: "repeat",
    context: {
      cueSupport: null,
      environment: "busy_outdoor",
      distance: null,
      durationBand: null,
      distraction: "mild",
    },
    changedDimension: null,
  },
  safety: null,
  exactContexts: [],
};

const emptyActionContextData = {
  ...contextualData,
  strongestContext: null,
  nextPracticeAction: {
    ruleId: "repeat_developing_context",
    direction: "repeat",
    context: {
      cueSupport: null,
      environment: null,
      distance: null,
      durationBand: null,
      distraction: null,
    },
    changedDimension: null,
  },
  exactContexts: [],
} satisfies ContextualProgress;

const activeSafety = {
  suppressed: true,
  ruleId: "reported_injury_or_pain",
  referral: "veterinarian",
} satisfies SuggestionSafety;

function setup({
  withContext = false,
  customSkill = false,
  multipleSkills = false,
  data = contextualData,
  withHashNavigator = false,
  contextualFetching = false,
  contextualError = false,
  contextualLoading = false,
  progressGoals,
  locale = "en",
}: {
  withContext?: boolean;
  customSkill?: boolean;
  multipleSkills?: boolean;
  data?: ContextualProgress;
  withHashNavigator?: boolean;
  contextualFetching?: boolean;
  contextualError?: boolean;
  contextualLoading?: boolean;
  progressGoals?: ProgressGoal[];
  locale?: "en" | "es";
} = {}) {
  localStorage.setItem("tc-locale", locale);
  const sourceGoals = progressGoals ?? (multipleSkills ? goalsWithTwoSkills : goals);
  const renderedGoals =
    withContext && !customSkill
      ? sourceGoals.map((goal) => ({
          ...goal,
          skills: goal.skills.map((skill) => ({ ...skill, catalogSkillKey: "sit" })),
        }))
      : sourceGoals;
  vi.mocked(progressLib.useProgress).mockReturnValue({
    data: renderedGoals,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof progressLib.useProgress>);
  for (const h of [
    "useAddSkill",
    "useUpdateSkill",
    "useDeleteSkill",
    "useDeleteSession",
    "useSetSkillLevel",
  ] as const) {
    vi.mocked(progressLib[h]).mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
      data: undefined,
    } as never);
  }
  vi.mocked(catalogLib.useTrainingCatalog).mockReturnValue({
    data: withContext ? catalog : [],
  } as unknown as ReturnType<typeof catalogLib.useTrainingCatalog>);
  vi.mocked(dogsLib.useRemoveGoal).mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<
    typeof dogsLib.useRemoveGoal
  >);
  vi.mocked(contextualProgressLib.useContextualProgress).mockReturnValue({
    data: withContext || customSkill ? data : undefined,
    isLoading: contextualLoading,
    isFetching: contextualFetching,
    isError: contextualError,
    refetch: vi.fn(),
  } as never);
  const mutateAsync = vi.fn().mockResolvedValue({});
  vi.mocked(progressLib.useLogSession).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof progressLib.useLogSession>);
  const recordEvent = vi.fn();
  vi.mocked(contextualProgressLib.useRecordContextualProgressEvent).mockReturnValue({
    mutate: recordEvent,
  } as never);
  const queryClient = new QueryClient();
  const renderPanel = () => (
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`${window.location.pathname}${window.location.hash}`]}>
          {withHashNavigator && <HashNavigator />}
          <ProgressPanel dogId="d1" />
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>
  );
  const rendered = render(renderPanel());
  return { mutateAsync, recordEvent, rerender: () => rendered.rerender(renderPanel()) };
}

afterEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("ProgressPanel", () => {
  it("prevents native navigation from the Add skill form", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Add skill" }));
    const form = screen.getByText("Save changes").closest("form");
    if (!form) throw new Error("missing add skill form");

    const submitEvent = createEvent.submit(form);
    fireEvent(form, submitEvent);

    expect(submitEvent.defaultPrevented).toBe(true);
  });

  it("prevents native navigation from the Edit skill form", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));
    fireEvent.click(screen.getByRole("button", { name: "Edit skill" }));
    const form = screen.getByText("Save changes").closest("form");
    if (!form) throw new Error("missing edit skill form");

    const submitEvent = createEvent.submit(form);
    fireEvent(form, submitEvent);

    expect(submitEvent.defaultPrevented).toBe(true);
  });

  it("shows a level badge on the collapsed skill row and the stepper when expanded", () => {
    setup();
    expect(screen.getByText(/Level 3 — Sometimes/i)).toBeInTheDocument();
    expect(contextualProgressLib.useContextualProgress).toHaveBeenCalledWith("d1", "s1", false);
    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));
    expect(screen.getByText(/Milestones · level 3 of 5/i)).toBeInTheDocument();
    expect(contextualProgressLib.useContextualProgress).toHaveBeenLastCalledWith("d1", "s1", true);
  });

  it("drops the panel header and gives each goal a remove control", () => {
    setup();
    expect(screen.queryByText(/Confidence: 1-5/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove basic manners/i })).toBeInTheDocument();
  });

  it("formats Spanish progress dates and duration units independently of browser English", () => {
    vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });
    const baseGoal = goals[0];
    const baseSkill = baseGoal?.skills[0];
    if (!baseGoal || !baseSkill) throw new Error("missing progress fixture");

    setup({
      progressGoals: [
        {
          ...baseGoal,
          skills: [
            {
              ...baseSkill,
              confidence: 2,
              sessionCount: 1,
              lastSessionAt: "2026-05-19T00:30:00.000Z",
              sessions: [
                {
                  id: "session-1",
                  occurredAt: "2026-05-19T00:30:00.000Z",
                  durationMinutes: 12,
                  notes: null,
                  createdAt: "2026-05-19T00:30:00.000Z",
                },
              ],
              milestones: [{ level: 2, reachedAt: "2026-05-19T00:30:00.000Z" }],
            },
          ],
        },
      ],
      locale: "es",
    });

    expect(screen.getByText(/Última sesión: 19 may/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /mostrar sit/i }));
    expect(screen.getByText(/alcanzado 19 may/)).toBeInTheDocument();
    expect(screen.getByText(/19 de mayo de 2026 · 12 minutos/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-05-19/)).not.toBeInTheDocument();
    expect(screen.queryByText(/May 18/)).not.toBeInTheDocument();
  });

  it("opens the session form with the recommended context and no implied confirmation", () => {
    setup({ withContext: true });
    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use this practice plan" }));
    expect(screen.getByLabelText("What else was going on?")).toHaveValue("mild");
    expect(
      screen.getByRole("checkbox", {
        name: "I practiced this at the current Level 3.",
      }),
    ).not.toBeChecked();
  });

  it("passes cached detail revalidation through without exposing a next-practice CTA", () => {
    setup({ withContext: true, contextualFetching: true });
    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));

    expect(screen.getByText("Developing")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Use this practice plan" }),
    ).not.toBeInTheDocument();
  });

  it("coordinates one page-level referral alert across expanded skill details", async () => {
    setup({
      withContext: true,
      multipleSkills: true,
      data: {
        ...contextualData,
        nextPracticeAction: null,
        safety: activeSafety,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));
    fireEvent.click(screen.getByRole("button", { name: /expand stay/i }));

    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(1));
    expect(
      screen.getByRole("heading", { name: "Let's pause training suggestions", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Please book a veterinary appointment/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /collapse sit/i }));
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /collapse stay/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("clears the page-level referral alert when an expanded detail clears safety", async () => {
    const { rerender } = setup({
      withContext: true,
      data: {
        ...contextualData,
        nextPracticeAction: null,
        safety: activeSafety,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(
      screen.getByRole("heading", { name: "Let's pause training suggestions", level: 3 }),
    ).toBeInTheDocument();
    vi.mocked(contextualProgressLib.useContextualProgress).mockReturnValue({
      data: { ...contextualData, nextPracticeAction: null, safety: null },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    rerender();

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("expands and scrolls to the owned skill named by the training hash", async () => {
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    Object.defineProperty(HTMLElement.prototype, "focus", {
      configurable: true,
      value: focus,
    });
    window.history.replaceState({}, "", "#skill-s1");

    setup();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /collapse sit/i })).toBeInTheDocument(),
    );
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(focus).not.toHaveBeenCalledWith({ preventScroll: true });
    expect(document.getElementById("skill-s1")).not.toHaveAttribute("tabindex");
  });

  it("reacts to an in-app training hash change and scrolls to the owned skill", async () => {
    const scrollIntoView = vi.fn();
    const focus = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    Object.defineProperty(HTMLElement.prototype, "focus", {
      configurable: true,
      value: focus,
    });

    setup({ withHashNavigator: true });
    expect(screen.getByRole("button", { name: /expand sit/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Sit" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /collapse sit/i })).toBeInTheDocument(),
    );
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(focus).not.toHaveBeenCalledWith({ preventScroll: true });
    expect(document.getElementById("skill-s1")).not.toHaveAttribute("tabindex");
  });

  it("ignores a training hash for a skill that is not rendered", async () => {
    window.history.replaceState({}, "", "#skill-not-owned");

    setup();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /expand sit/i })).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /collapse sit/i })).not.toBeInTheDocument();
  });

  it("updates an already-open blank session form when applying a recommendation", () => {
    const { recordEvent } = setup({ withContext: true });
    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));
    fireEvent.click(screen.getByRole("button", { name: "Log session" }));
    expect(screen.getByLabelText("What else was going on?")).toHaveValue("");
    expect(screen.queryByLabelText("Where were you?")).not.toBeInTheDocument();

    recordEvent.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Use this practice plan" }));

    expect(screen.getByLabelText("What else was going on?")).toHaveValue("mild");
    expect(recordEvent).toHaveBeenCalledWith({
      name: "training.context_next_action_used",
      surface: "skill_detail",
      ruleId: "repeat_developing_context",
      direction: "repeat",
    });
  });

  it("applies a contextual action to a custom skill and submits its recommended evidence", async () => {
    const { mutateAsync, recordEvent } = setup({ customSkill: true });
    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));
    fireEvent.click(screen.getByRole("button", { name: "Log session" }));
    expect(screen.queryByLabelText("What else was going on?")).toBeNull();

    recordEvent.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Use this practice plan" }));

    expect(screen.getByLabelText("What else was going on?")).toHaveValue("mild");
    expect(screen.getByLabelText("Where were you?")).toHaveValue("busy_outdoor");
    expect(
      screen.getByRole("checkbox", {
        name: "I practiced this at the current Level 3.",
      }),
    ).not.toBeChecked();
    expect(recordEvent).toHaveBeenCalledWith({
      name: "training.context_next_action_used",
      surface: "skill_detail",
      ruleId: "repeat_developing_context",
      direction: "repeat",
    });

    const form = screen.getByRole("button", { name: "Save session" }).closest("form");
    if (!form) throw new Error("missing session form");
    fireEvent.submit(form);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const body = mutateAsync.mock.calls[0]?.[0]?.body as Record<string, unknown>;
    expect(body.distraction).toBe("mild");
    expect(body.environment).toBe("busy_outdoor");
    expect(body.confirmCurrentLevel).toBeUndefined();
  });

  it("reports an empty action context instead of silently ignoring the recommendation", () => {
    const { recordEvent } = setup({ customSkill: true, data: emptyActionContextData });
    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));
    recordEvent.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Use this practice plan" }));

    expect(toast.error).toHaveBeenCalledWith(
      "This practice plan is unavailable. Record a new outcome and context before using it.",
    );
    expect(screen.queryByRole("button", { name: "Save session" })).not.toBeInTheDocument();
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("clears the recommended context when the prefilled form is cancelled", () => {
    setup({ withContext: true });
    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use this practice plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Log session" }));

    expect(screen.getByLabelText("What else was going on?")).toHaveValue("");
  });

  it("clears the recommendation and visible fields from the mounted form on reset", async () => {
    setup({ withContext: true });
    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));
    fireEvent.click(screen.getByRole("button", { name: "Log session" }));
    fireEvent.click(screen.getByRole("button", { name: "Use this practice plan" }));
    expect(screen.getByLabelText("What else was going on?")).toHaveValue("mild");

    fireEvent.click(screen.getByRole("button", { name: "Log session" }));

    await waitFor(() => expect(screen.getByLabelText("What else was going on?")).toHaveValue(""));
  });
});
