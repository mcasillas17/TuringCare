import { LocaleProvider } from "@/i18n";
import * as contextualProgressLib from "@/lib/contextual-progress";
import * as dogsLib from "@/lib/dogs";
import * as progressLib from "@/lib/progress";
import type { ProgressGoal } from "@/lib/progress";
import * as catalogLib from "@/lib/training-catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CatalogTemplate, ContextualProgress } from "@turingcare/shared";
import { describe, expect, it, vi } from "vitest";
import { ProgressPanel } from "./progress-panel";

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
      environment: null,
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
      environment: null,
      distance: null,
      durationBand: null,
      distraction: "mild",
    },
    changedDimension: null,
  },
  exactContexts: [],
};

function setup({ withContext = false }: { withContext?: boolean } = {}) {
  const renderedGoals = withContext
    ? goals.map((goal) => ({
        ...goal,
        skills: goal.skills.map((skill) => ({ ...skill, catalogSkillKey: "sit" })),
      }))
    : goals;
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
    data: withContext ? contextualData : undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
  const recordEvent = vi.fn();
  vi.mocked(contextualProgressLib.useRecordContextualProgressEvent).mockReturnValue({
    mutate: recordEvent,
  } as never);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <ProgressPanel dogId="d1" />
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { recordEvent };
}

describe("ProgressPanel", () => {
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

  it("updates an already-open blank session form when applying a recommendation", () => {
    const { recordEvent } = setup({ withContext: true });
    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));
    fireEvent.click(screen.getByRole("button", { name: "Log session" }));
    expect(screen.getByLabelText("What else was going on?")).toHaveValue("");

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
