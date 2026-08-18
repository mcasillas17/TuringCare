import { CompletionStep } from "@/components/guided-setup/completion-step";
import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuidedSetupRecord, GuidedSetupStatus, TrainingSuggestion } from "@turingcare/shared";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useGuidedSetup: vi.fn(),
  start: vi.fn(),
  saveIntent: vi.fn(),
  completeBehavior: vi.fn(),
  completeTraining: vi.fn(),
  completeProgress: vi.fn(),
  afterComplete: vi.fn(),
  onBehaviorCompleted: undefined as ((response: unknown) => void) | undefined,
  skip: vi.fn(),
  abandon: vi.fn(),
  signOut: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("@/lib/guided-setup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/guided-setup")>();
  return {
    ...actual,
    useGuidedSetup: mocks.useGuidedSetup,
    useStartGuidedSetup: () => ({ mutateAsync: mocks.start, isPending: false }),
    useSaveGuidedSetupIntent: () => ({ mutateAsync: mocks.saveIntent, isPending: false }),
    useCompleteBehaviorSetup: (options?: { onCompleted?: (response: unknown) => void }) => {
      mocks.onBehaviorCompleted = options?.onCompleted;
      return {
        mutateAsync: async (body: unknown) => {
          const response = await mocks.completeBehavior(body);
          options?.onCompleted?.(response);
          mocks.afterComplete();
          return response;
        },
        isPending: false,
      };
    },
    useCompleteProgressSetup: (options?: { onCompleted?: (response: unknown) => void }) => ({
      mutateAsync: async (body: unknown) => {
        const response = await mocks.completeProgress(body);
        options?.onCompleted?.(response);
        mocks.afterComplete();
        return response;
      },
      isPending: false,
    }),
    useCompleteTrainingSetup: (options?: { onCompleted?: (response: unknown) => void }) => ({
      mutateAsync: async (body: unknown) => {
        const response = await mocks.completeTraining(body);
        options?.onCompleted?.(response);
        return response;
      },
      isPending: false,
    }),
    useSkipGuidedSetup: (options?: { onCompleted?: (response: unknown) => void }) => ({
      mutateAsync: async (body: unknown) => {
        const response = await mocks.skip(body);
        options?.onCompleted?.(response);
        return response;
      },
      isPending: false,
    }),
    useAbandonGuidedSetup: () => ({ mutateAsync: mocks.abandon, isPending: false }),
  };
});

vi.mock("@/lib/auth-client", () => ({
  signOut: mocks.signOut,
  useSession: mocks.useSession,
}));

vi.mock("@/lib/training-catalog", () => ({
  useTrainingCatalog: () => ({
    data: [
      {
        key: "basic-manners",
        name: "Basic Manners",
        description: "Foundational skills",
        skills: [],
      },
      {
        key: "puppy-fundamentals",
        name: "Puppy Fundamentals",
        description: "Puppy skills",
        skills: [],
      },
      {
        key: "recall-reliability",
        name: "Recall Reliability",
        description: "Reliable recall",
        skills: [],
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));

import { GuidedSetupLayout } from "@/components/guided-setup/guided-setup-layout";
import { guidedSetupKey } from "@/lib/guided-setup";
import { GuidedSetup } from "./guided-setup";

const setupId = "00000000-0000-4000-8000-000000000001";

function record(overrides: Partial<GuidedSetupRecord> = {}): GuidedSetupRecord {
  return {
    id: setupId,
    dogId: "dog-1",
    dogName: "Biscuit",
    currentStep: "intent",
    intent: null,
    startedAt: "2026-08-16T00:00:00.000Z",
    completedAt: null,
    completionReason: null,
    firstActionType: null,
    firstActionId: null,
    ...overrides,
  };
}

function status(overrides: Partial<GuidedSetupStatus> = {}): GuidedSetupStatus {
  return { active: null, latest: null, autoStartEligible: true, ...overrides };
}

function trainingSuggestion(): TrainingSuggestion {
  return {
    suggestionId: "suggestion-1",
    dismissed: false,
    type: "exercise",
    ruleId: "cold_start_curriculum_level",
    curriculumVersion: "2026-08-11",
    dogId: "dog-1",
    weekKey: "2026-08-10",
    skill: {
      id: "skill-1",
      name: "Sit",
      catalogSkillKey: "basic-manners.sit",
      level: 1,
      goalId: "goal-1",
      goalName: "Basic Manners",
    },
    primary: { level: 1, exercise: "Lure into a sit in a quiet room.", dimension: "cue_support" },
    fallback: {
      level: 1,
      exercise: "Lure into a sit in a quiet room.",
      reducedDimension: "cue_support",
      sameLevelEasing: true,
      easingStrategy: "add_cue_help",
    },
    requestedDimensions: ["cue_support", "environment", "distraction"],
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
}

function renderCompletion(
  setup: GuidedSetupRecord,
  options: { suggestion?: TrainingSuggestion; actionDeleted?: boolean } = {},
) {
  return render(
    <LocaleProvider>
      <MemoryRouter>
        <CompletionStep setup={setup} {...options} />
      </MemoryRouter>
    </LocaleProvider>,
  );
}

function routeTree(initialEntry: string, allowNewDog: boolean) {
  return (
    <LocaleProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/my/setup" element={<GuidedSetup allowNewDog={allowNewDog} />} />
          <Route path="/my/setup/new" element={<GuidedSetup allowNewDog />} />
          <Route path="/my" element={<p>overview destination</p>} />
          <Route path="/my/dogs/:id" element={<p>dog destination</p>} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>
  );
}

function renderRoute(
  initialEntry: string,
  setupStatus: GuidedSetupStatus,
  allowNewDog = false,
  queryOverrides: Record<string, unknown> = {},
  strictMode = false,
) {
  mocks.useGuidedSetup.mockReturnValue({
    data: setupStatus,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...queryOverrides,
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (
    <QueryClientProvider client={queryClient}>
      {routeTree(initialEntry, allowNewDog)}
    </QueryClientProvider>
  );
  return render(strictMode ? <StrictMode>{tree}</StrictMode> : tree);
}

function renderStrictRoute(
  initialEntry: string,
  setupStatus: GuidedSetupStatus,
  allowNewDog = false,
  queryOverrides: Record<string, unknown> = {},
) {
  return renderRoute(initialEntry, setupStatus, allowNewDog, queryOverrides, true);
}

afterEach(() => {
  vi.clearAllMocks();
  mocks.afterComplete.mockReset();
  mocks.onBehaviorCompleted = undefined;
});

describe("GuidedSetup", () => {
  it("shows dog basics for an eligible owner", () => {
    renderRoute("/my/setup", status());

    expect(screen.getByRole("heading", { name: /Tell us about your dog/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    const stepIndicator = screen.getByText("Step 1 of 3");
    expect(stepIndicator.tagName).toBe("P");
    expect(stepIndicator.closest("section")).toHaveAttribute(
      "aria-labelledby",
      "guided-setup-heading",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Now on step 1 of 3");
    expect(screen.queryByRole("button", { name: /Exit setup/i })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: /Tell us about your dog/i }),
    );
  });

  it("keeps guided transitions motion-safe and disables them for reduced motion", () => {
    renderRoute("/my/setup", status());

    const shell = screen.getByRole("region", {
      name: /Tell us about your dog/i,
    });
    expect(shell).toHaveClass(
      "motion-safe:transition-opacity",
      "motion-safe:duration-200",
      "motion-reduce:transition-none",
    );
    expect(shell.className).not.toMatch(/(?:^|\s)(?:transition|animate-)/);
  });

  describe("CompletionStep", () => {
    it("renders Spanish deletion completion copy", () => {
      const languages = navigator.languages;
      try {
        Object.defineProperty(navigator, "languages", {
          configurable: true,
          value: ["es-MX"],
        });
        renderCompletion(
          record({
            dogId: null,
            dogName: null,
            intent: "understand_behavior",
            completionReason: "first_action_completed",
            completedAt: "2026-08-16T01:00:00Z",
          }),
          { actionDeleted: true },
        );

        expect(screen.getByRole("status")).toHaveTextContent(
          "El registro de tu primer paso ya no está disponible.",
        );
        expect(screen.getByRole("link", { name: "Continuar a tu resumen" })).toHaveAttribute(
          "href",
          "/my",
        );
      } finally {
        Object.defineProperty(navigator, "languages", {
          configurable: true,
          value: languages,
        });
      }
    });

    it.each([
      ["behavior", "journal"],
      ["progress", "journal"],
      ["training", "week"],
    ] as const)("links a saved %s action to the next step", (actionType, destination) => {
      renderCompletion(
        record({
          intent:
            actionType === "behavior"
              ? "understand_behavior"
              : actionType === "progress"
                ? "track_progress"
                : "train_skill",
          firstActionType: actionType,
          completionReason: "first_action_completed",
          completedAt: "2026-08-16T01:00:00Z",
        }),
      );

      expect(screen.getByRole("status")).toHaveTextContent("Your first step was saved.");
      expect(screen.getByRole("link", { name: /Continue/i })).toHaveAttribute(
        "href",
        `/my/dogs/dog-1/${destination}`,
      );
      expect(screen.queryByRole("button", { name: /Back|Exit/i })).not.toBeInTheDocument();
    });

    it("links a skipped setup to the dog workspace", () => {
      renderCompletion(
        record({
          intent: "train_skill",
          completionReason: "skipped",
          completedAt: "2026-08-16T01:00:00Z",
        }),
      );

      expect(screen.getByRole("status")).toHaveTextContent("You skipped your first step.");
      expect(screen.getByRole("link", { name: /Continue/i })).toHaveAttribute(
        "href",
        "/my/dogs/dog-1",
      );
    });

    it("shows a preview suggestion and keeps the safety notice visible", () => {
      const suggestion = trainingSuggestion();
      renderCompletion(
        record({
          intent: "train_skill",
          firstActionType: "training",
          completionReason: "first_action_completed",
          completedAt: "2026-08-16T01:00:00Z",
        }),
        { suggestion },
      );

      expect(screen.getAllByText("Lure into a sit in a quiet room.")).toHaveLength(2);
      expect(screen.queryByText("We did this")).not.toBeInTheDocument();
      expect(screen.queryByText("Choose a different focus")).not.toBeInTheDocument();

      const safetySuggestion = {
        ...suggestion,
        safety: {
          suppressed: true,
          ruleId: "reported_injury_or_pain",
          referral: "veterinarian",
        },
      } satisfies TrainingSuggestion;
      renderCompletion(
        record({
          intent: "train_skill",
          firstActionType: "training",
          completionReason: "first_action_completed",
          completedAt: "2026-08-16T01:00:00Z",
        }),
        { suggestion: safetySuggestion },
      );
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("does not render a training preview when a replay has no current suggestion", () => {
      renderCompletion(
        record({
          intent: "train_skill",
          firstActionType: "training",
          completionReason: "first_action_completed",
          completedAt: "2026-08-16T01:00:00Z",
        }),
      );

      expect(
        screen.queryByRole("heading", { name: "This week's suggestion" }),
      ).not.toBeInTheDocument();
    });

    it("uses a safe dashboard fallback for deleted or dogless completions", () => {
      renderCompletion(
        record({
          dogId: null,
          dogName: null,
          completionReason: "first_action_completed",
          completedAt: "2026-08-16T01:00:00Z",
        }),
        { actionDeleted: true, suggestion: trainingSuggestion() },
      );

      expect(screen.getByRole("status")).toHaveTextContent(
        "Your first-step record is no longer available.",
      );
      expect(screen.getByRole("link", { name: /Continue/i })).toHaveAttribute("href", "/my");
      expect(screen.queryByText("Lure into a sit in a quiet room.")).not.toBeInTheDocument();
      expect(screen.queryByText("Barking at visitors")).not.toBeInTheDocument();
    });
  });

  it("starts basics with the exact profile and advances without recreating the setup", async () => {
    const user = userEvent.setup();
    const active = record();
    mocks.start.mockResolvedValue({ setup: active });
    renderRoute("/my/setup", status());
    const stepAnnouncement = screen.getByRole("status");
    expect(stepAnnouncement).toHaveTextContent("Now on step 1 of 3");

    await user.type(screen.getByLabelText("Name"), "Biscuit");
    await user.selectOptions(screen.getByLabelText("Size"), "medium");
    await user.selectOptions(screen.getByLabelText("Sex"), "female");
    await user.selectOptions(screen.getByLabelText("Source"), "rescue");
    await user.selectOptions(screen.getByLabelText("Vaccination"), "in_progress");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => expect(screen.getByRole("radiogroup")).toBeInTheDocument());
    expect(stepAnnouncement).toHaveTextContent("Now on step 2 of 3");
    expect(mocks.start).toHaveBeenCalledWith({
      name: "Biscuit",
      size: "medium",
      sex: "female",
      spayedNeutered: false,
      source: "rescue",
      vaccineStage: "in_progress",
    });
    expect(mocks.start).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/What would help most with Biscuit/i)).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  });

  it("completes a realistic setup with keyboard-only navigation", async () => {
    const user = userEvent.setup();
    const intentSetup = record({ currentStep: "intent" });
    const actionSetup = record({ currentStep: "action", intent: "track_progress" });
    const completedSetup = record({
      currentStep: "action",
      intent: "track_progress",
      completedAt: "2026-08-16T01:00:00Z",
      completionReason: "first_action_completed",
      firstActionType: "progress",
      firstActionId: "entry-1",
    });
    mocks.start.mockResolvedValue({ setup: intentSetup });
    mocks.saveIntent.mockResolvedValue({ setup: actionSetup });
    mocks.completeProgress.mockResolvedValue({
      setup: completedSetup,
      entry: { id: "entry-1" },
      actionDeleted: false,
    });
    renderRoute("/my/setup", status());

    await user.tab();
    expect(screen.getByLabelText("Name")).toHaveFocus();
    await user.type(screen.getByLabelText("Name"), "Biscuit");
    for (let index = 0; index < 6; index += 1) await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Understand behavior/i })).toBeInTheDocument(),
    );
    const understand = screen.getByRole("radio", { name: /Understand behavior/i });
    const track = screen.getByRole("radio", { name: /Track progress/i });
    await user.tab();
    expect(understand).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{ArrowDown}");
    await user.keyboard(" ");
    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "Continue" })).toHaveFocus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(track).toHaveFocus();
    await user.keyboard("{Tab}");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(screen.getByRole("radio", { name: "Better" })).toBeInTheDocument());
    await user.tab();
    expect(screen.getByRole("radio", { name: "Better" })).toHaveFocus();
    await user.keyboard(" ");
    await user.keyboard("{Tab}");
    await user.type(screen.getByRole("textbox", { name: "Short note" }), "Settled faster.");
    await user.keyboard("{Tab}");
    expect(screen.getByRole("button", { name: "Save first step" })).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Your first step was saved."),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Your guided setup is complete" }),
    );
    expect(mocks.completeProgress).toHaveBeenCalledWith({
      setupId,
      trend: "better",
      note: "Settled faster.",
    });
  });

  it("shows a localized name length error and preserves the value without starting setup", async () => {
    const user = userEvent.setup();
    const name = "B".repeat(101);
    renderRoute("/my/setup", status());

    const nameInput = screen.getByLabelText("Name");
    await user.type(nameInput, name);
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Name must be 100 characters or fewer.");
    expect(nameInput).toHaveValue(name);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("shows a localized breed length error and preserves the value without starting setup", async () => {
    const user = userEvent.setup();
    const breed = "B".repeat(101);
    renderRoute("/my/setup", status());

    await user.type(screen.getByLabelText("Name"), "Biscuit");
    const breedInput = screen.getByLabelText("Breed");
    await user.type(breedInput, breed);
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Breed must be 100 characters or fewer.");
    expect(breedInput).toHaveValue(breed);
    expect(mocks.start).not.toHaveBeenCalled();
  });

  it("uses native radio arrow navigation through all three intents", async () => {
    const user = userEvent.setup();
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "intent" }),
        autoStartEligible: false,
      }),
    );

    const understand = screen.getByRole("radio", { name: /Understand behavior/i });
    const train = screen.getByRole("radio", { name: /Train a skill/i });
    const track = screen.getByRole("radio", { name: /Track progress/i });

    understand.focus();
    await user.keyboard("{ArrowDown}");
    expect(train).toHaveFocus();
    expect(train).toBeChecked();

    await user.keyboard("{ArrowDown}");
    expect(track).toHaveFocus();
    expect(track).toBeChecked();
  });

  it("shows a localized required error for an empty intent submission", async () => {
    const user = userEvent.setup();
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "intent" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: /Continue/i }));

    expect(screen.getByRole("alert")).toHaveTextContent("Choose one option to continue.");
    expect(screen.getByRole("radio", { name: /Understand behavior/i })).toHaveFocus();
    expect(screen.getByRole("radiogroup")).toHaveAttribute(
      "aria-describedby",
      "guided-setup-intent-error",
    );
    expect(
      screen.queryByText("Couldn't save your choice. Please try again."),
    ).not.toBeInTheDocument();
  });

  it("clears the required error when an intent is selected", async () => {
    const user = userEvent.setup();
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "intent" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await user.click(screen.getByRole("radio", { name: /Track progress/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Couldn't save your choice. Please try again."),
    ).not.toBeInTheDocument();
  });

  it("resumes an active intent step and saves a keyboard-selected intent", async () => {
    const user = userEvent.setup();
    mocks.saveIntent.mockResolvedValue({
      setup: record({ currentStep: "action", intent: "train_skill" }),
    });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "intent" }),
        autoStartEligible: false,
      }),
    );

    const radio = screen.getByRole("radio", { name: /Train a skill/i });
    radio.focus();
    await user.keyboard(" ");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() =>
      expect(mocks.saveIntent).toHaveBeenCalledWith({
        setupId,
        intent: "train_skill",
      }),
    );
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
  });

  it("retains basics values and shows a localized error when start is rejected", async () => {
    const user = userEvent.setup();
    mocks.start.mockRejectedValue(new Error("start_failed"));
    renderRoute("/my/setup", status());

    const name = screen.getByLabelText("Name");
    await user.type(name, "Biscuit");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't start/i));
    expect(name).toHaveValue("Biscuit");
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it("reconciles an active setup conflict to the server intent step", async () => {
    const user = userEvent.setup();
    const active = record({ currentStep: "intent" });
    const refetch = vi.fn().mockResolvedValue({
      data: status({ active, autoStartEligible: false }),
    });
    mocks.start.mockRejectedValue(new Error("active_setup_exists"));
    renderRoute("/my/setup", status(), false, { refetch });

    await user.type(screen.getByLabelText("Name"), "Biscuit");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => expect(screen.getByRole("radiogroup")).toBeInTheDocument());
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it("shows the active setup error when reconciliation returns an error result", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({
      data: status({ active: record({ currentStep: "intent" }), autoStartEligible: false }),
      isError: true,
      error: new Error("load_failed"),
    });
    mocks.start.mockRejectedValue(new Error("active_setup_exists"));
    renderRoute("/my/setup", status(), false, { refetch });

    await user.type(screen.getByLabelText("Name"), "Biscuit");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Another guided setup is already active/i,
      ),
    );
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
  });

  it("preserves the active setup conflict when reconciliation rejects", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockRejectedValue(new Error("load_failed"));
    mocks.start.mockRejectedValue(new Error("active_setup_exists"));
    renderRoute("/my/setup", status(), false, { refetch });

    await user.type(screen.getByLabelText("Name"), "Biscuit");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Another guided setup is already active/i,
      ),
    );
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("shows the active setup error when reconciliation returns no active setup", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({
      data: status({ active: null, autoStartEligible: true }),
      isError: false,
    });
    mocks.start.mockRejectedValue(new Error("active_setup_exists"));
    renderRoute("/my/setup", status(), false, { refetch });

    await user.type(screen.getByLabelText("Name"), "Biscuit");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /Another guided setup is already active/i,
      ),
    );
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("reconciles a behavior conflict to the server-selected action", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({
      data: status({
        active: record({ currentStep: "action", intent: "track_progress" }),
        autoStartEligible: false,
      }),
    });
    mocks.completeBehavior.mockRejectedValue(new Error("intent_mismatch"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
      false,
      { refetch },
    );

    await user.type(screen.getByLabelText("What concern would you like to understand?"), "Barking");
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() => expect(screen.getByRole("radio", { name: "Better" })).toBeInTheDocument());
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("remounts action state when conflict reconciliation selects a different setup", async () => {
    const user = userEvent.setup();
    const nextSetupId = "00000000-0000-4000-8000-000000000002";
    const refetch = vi.fn().mockResolvedValue({
      data: status({
        active: record({
          id: nextSetupId,
          dogId: "dog-2",
          dogName: "Clover",
          currentStep: "action",
          intent: "understand_behavior",
        }),
        autoStartEligible: false,
      }),
    });
    mocks.completeBehavior
      .mockRejectedValueOnce(new Error("intent_mismatch"))
      .mockResolvedValueOnce({
        setup: record({
          id: nextSetupId,
          dogId: "dog-2",
          dogName: "Clover",
          completedAt: "2026-08-16T01:00:00Z",
          completionReason: "first_action_completed",
        }),
        concern: { id: "concern-2" },
        actionDeleted: false,
      });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
      false,
      { refetch },
    );

    const concern = screen.getByLabelText("What concern would you like to understand?");
    await user.type(concern, "Barking at visitors");
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() => expect(screen.getByDisplayValue(nextSetupId)).toBeInTheDocument());
    expect(screen.getByLabelText("What concern would you like to understand?")).toHaveValue("");

    await user.type(
      screen.getByLabelText("What concern would you like to understand?"),
      "Jumping on guests",
    );
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() =>
      expect(mocks.completeBehavior).toHaveBeenLastCalledWith({
        setupId: nextSetupId,
        concern: "Jumping on guests",
        severity: "mild",
        safetySignal: null,
        safetyConfirmed: false,
      }),
    );
    expect(mocks.completeBehavior).toHaveBeenCalledTimes(2);
  });

  it("redirects after a behavior conflict finds a completed setup", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({
      data: status({
        active: null,
        latest: record({ completedAt: "2026-08-16T01:00:00Z" }),
        autoStartEligible: false,
      }),
    });
    mocks.completeBehavior.mockRejectedValue(new Error("setup_already_completed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
      false,
      { refetch },
    );

    await user.type(screen.getByLabelText("What concern would you like to understand?"), "Barking");
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() => expect(screen.getByText("overview destination")).toBeInTheDocument());
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
  });

  it("keeps behavior values and shows an action error when conflict reconciliation fails", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockRejectedValue(new Error("load_failed"));
    mocks.completeBehavior.mockRejectedValue(new Error("intent_mismatch"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
      false,
      { refetch },
    );

    const concern = screen.getByLabelText("What concern would you like to understand?");
    await user.type(concern, "Barking at visitors");
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /This action no longer matches the selected focus/i,
      ),
    );
    expect(concern).toHaveValue("Barking at visitors");
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
  });

  it("retains intent selection and shows an error when intent save is rejected", async () => {
    const user = userEvent.setup();
    mocks.saveIntent.mockRejectedValue(new Error("intent_failed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "intent" }),
        autoStartEligible: false,
      }),
    );

    const radio = screen.getByRole("radio", { name: /Track progress/i });
    await user.click(radio);
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't save/i));
    expect(radio).toBeChecked();
    expect(screen.queryByText("Choose one option to continue.")).not.toBeInTheDocument();
    expect(mocks.saveIntent).toHaveBeenCalledTimes(1);
  });

  it("serializes abandon behind a pending intent save and recovers after rejection", async () => {
    let rejectIntent!: (error: Error) => void;
    const user = userEvent.setup();
    mocks.saveIntent.mockReturnValue(
      new Promise((_, reject) => {
        rejectIntent = reject;
      }),
    );
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "intent" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("radio", { name: /Track progress/i }));
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() => expect(mocks.saveIntent).toHaveBeenCalledTimes(1));

    const exitButton = screen.getByRole("button", { name: "Exit setup" });
    expect(exitButton).toBeDisabled();
    rejectIntent(new Error("intent_failed"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't save/i));
    expect(exitButton).not.toBeDisabled();

    await user.click(exitButton);
    expect(screen.getByRole("button", { name: "Confirm exit" })).toBeInTheDocument();
  });

  it("reconciles a completed intent conflict to the server action step", async () => {
    const user = userEvent.setup();
    const active = record({ currentStep: "action", intent: "track_progress" });
    const refetch = vi.fn().mockResolvedValue({
      data: status({ active, autoStartEligible: false }),
    });
    mocks.saveIntent.mockRejectedValue(new Error("setup_already_completed"));
    renderRoute(
      "/my/setup",
      status({ active: record({ currentStep: "intent" }), autoStartEligible: false }),
      false,
      { refetch },
    );

    await user.click(screen.getByRole("radio", { name: /Track progress/i }));
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => expect(screen.getByText("Step 3 of 3")).toBeInTheDocument());
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("remounts intent state when conflict reconciliation selects a different dog", async () => {
    const user = userEvent.setup();
    const nextSetupId = "00000000-0000-4000-8000-000000000003";
    const refetch = vi.fn().mockResolvedValue({
      data: status({
        active: record({
          id: nextSetupId,
          dogId: "dog-2",
          dogName: "Clover",
          currentStep: "intent",
          intent: null,
        }),
        autoStartEligible: false,
      }),
    });
    mocks.saveIntent.mockRejectedValueOnce(new Error("intent_mismatch")).mockResolvedValueOnce({
      setup: record({
        id: nextSetupId,
        dogId: "dog-2",
        dogName: "Clover",
        currentStep: "action",
        intent: "track_progress",
      }),
    });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "intent" }),
        autoStartEligible: false,
      }),
      false,
      { refetch },
    );

    await user.click(screen.getByRole("radio", { name: /Track progress/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(screen.getByText("What would help most with Clover?")).toBeInTheDocument(),
    );
    expect(screen.getByRole("radio", { name: /Track progress/i })).not.toBeChecked();

    await user.click(screen.getByRole("radio", { name: /Track progress/i }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(mocks.saveIntent).toHaveBeenLastCalledWith({
        setupId: nextSetupId,
        intent: "track_progress",
      }),
    );
  });

  it("shows the completion conflict when reconciliation returns an error result", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({
      data: status({
        active: record({ currentStep: "action", intent: "track_progress" }),
        autoStartEligible: false,
      }),
      isError: true,
      error: new Error("load_failed"),
    });
    mocks.saveIntent.mockRejectedValue(new Error("setup_already_completed"));
    renderRoute(
      "/my/setup",
      status({ active: record({ currentStep: "intent" }), autoStartEligible: false }),
      false,
      { refetch },
    );

    await user.click(screen.getByRole("radio", { name: /Track progress/i }));
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/This guided setup is already complete/i),
    );
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
  });

  it("shows the completion conflict when reconciliation rejects", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockRejectedValue(new Error("load_failed"));
    mocks.saveIntent.mockRejectedValue(new Error("setup_already_completed"));
    renderRoute(
      "/my/setup",
      status({ active: record({ currentStep: "intent" }), autoStartEligible: false }),
      false,
      { refetch },
    );

    await user.click(screen.getByRole("radio", { name: /Track progress/i }));
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/This guided setup is already complete/i),
    );
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
  });

  it("clears an in-session setup after completed intent reconciliation returns no active setup", async () => {
    const user = userEvent.setup();
    const active = record({ currentStep: "intent" });
    const refetch = vi.fn().mockResolvedValue({
      data: status({
        active: null,
        latest: record({ completedAt: "2026-08-16T01:00:00Z" }),
        autoStartEligible: false,
      }),
      isError: false,
    });
    mocks.start.mockResolvedValue({ setup: active });
    mocks.saveIntent.mockRejectedValue(new Error("setup_already_completed"));
    renderRoute("/my/setup", status(), false, { refetch });

    await user.type(screen.getByLabelText("Name"), "Biscuit");
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await waitFor(() => expect(screen.getByRole("radiogroup")).toBeInTheDocument());

    await user.click(screen.getByRole("radio", { name: /Track progress/i }));
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => expect(screen.getByText("overview destination")).toBeInTheDocument());
    expect(screen.queryByText("Step 2 of 3")).not.toBeInTheDocument();
  });

  it("allows an explicit new dog setup when there is no active setup", () => {
    renderRoute(
      "/my/setup/new",
      status({ autoStartEligible: false, latest: record({ completedAt: "2026-08-16T01:00:00Z" }) }),
      true,
    );

    expect(screen.getByRole("heading", { name: /Tell us about your dog/i })).toBeInTheDocument();
  });

  it("redirects the normal setup route when no setup is eligible", async () => {
    renderRoute("/my/setup", status({ autoStartEligible: false }));

    await waitFor(() => expect(screen.getByText("overview destination")).toBeInTheDocument());
  });

  it("keeps dog basics mounted with its values during a retained-data refetch error", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    renderRoute("/my/setup", status(), false, {
      isError: true,
      refetch,
    });

    const name = screen.getByLabelText("Name");
    await user.type(name, "Biscuit");

    expect(name).toHaveValue("Biscuit");
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Retry guided setup/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps intent selection mounted during a retained-data refetch error", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "intent" }),
        autoStartEligible: false,
      }),
      false,
      { isError: true, refetch },
    );

    const radio = screen.getByRole("radio", { name: /Track progress/i });
    await user.click(radio);

    expect(radio).toBeChecked();
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry guided setup/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Retry guided setup/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps a child conflict error visible when status refetch loses its data", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let queryState: Record<string, unknown>;
    const renderResult: { current?: ReturnType<typeof render> } = {};
    const refetch = vi.fn().mockImplementation(async () => {
      queryState = {
        data: undefined,
        isLoading: false,
        isError: true,
        isFetching: false,
        refetch,
      };
      renderResult.current?.rerender(
        <QueryClientProvider client={queryClient}>
          {routeTree("/my/setup", false)}
        </QueryClientProvider>,
      );
      throw new Error("load_failed");
    });
    queryState = {
      data: status(),
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch,
    };
    mocks.useGuidedSetup.mockImplementation(() => queryState);
    mocks.start.mockRejectedValue(new Error("active_setup_exists"));
    renderResult.current = render(
      <QueryClientProvider client={queryClient}>
        {routeTree("/my/setup", false)}
      </QueryClientProvider>,
    );

    await user.type(screen.getByLabelText("Name"), "Biscuit");
    await user.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() =>
      expect(screen.getByText(/Another guided setup is already active/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
  });

  it("shows a localized loading and load-failure state", () => {
    mocks.useGuidedSetup.mockReturnValue({ isLoading: true, isError: false });
    render(
      <LocaleProvider>
        <MemoryRouter>
          <GuidedSetup />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(screen.getByText("Loading…")).toBeInTheDocument();

    const refetch = vi.fn();
    mocks.useGuidedSetup.mockReturnValue({
      isLoading: false,
      isError: true,
      data: undefined,
      refetch,
    });
    render(
      <LocaleProvider>
        <MemoryRouter>
          <GuidedSetup />
        </MemoryRouter>
      </LocaleProvider>,
    );
    expect(screen.getByText(/Couldn't load guided setup/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry guided setup/i })).toBeInTheDocument();
  });

  it("renders Spanish guided setup copy", () => {
    const languages = navigator.languages;
    try {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        value: ["es-MX"],
      });
      renderRoute("/my/setup", status());

      expect(
        screen.getByRole("heading", { name: /Cuéntanos sobre tu perro/i }),
      ).toBeInTheDocument();
      expect(screen.getByText("Paso 1 de 3")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Ahora estás en el paso 1 de 3");
    } finally {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        value: languages,
      });
    }
  });

  it("resumes action at step 3 and offers a two-step abandon flow", async () => {
    const user = userEvent.setup();
    mocks.abandon.mockResolvedValue({ setup: record({ completedAt: "2026-08-16T01:00:00Z" }) });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "track_progress" }),
        autoStartEligible: false,
      }),
    );

    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Exit setup/i }));
    expect(screen.getByRole("button", { name: /Confirm exit/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Confirm exit/i }));

    await waitFor(() => expect(mocks.abandon).toHaveBeenCalledWith({ setupId }));
    expect(screen.getByText("dog destination")).toBeInTheDocument();
  });

  it("moves focus into abandon confirmation and restores it on cancel", async () => {
    const user = userEvent.setup();
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "track_progress" }),
        autoStartEligible: false,
      }),
    );

    const exitButton = screen.getByRole("button", { name: /Exit setup/i });
    await user.click(exitButton);
    const confirmButton = screen.getByRole("button", { name: /Confirm exit/i });
    await waitFor(() => expect(confirmButton).toHaveFocus());

    await user.click(screen.getByRole("button", { name: /Keep setup/i }));
    expect(screen.getByRole("button", { name: /Exit setup/i })).toHaveFocus();
  });

  it("abandons from intent and stays on step 2 when abandon fails", async () => {
    const user = userEvent.setup();
    mocks.abandon.mockRejectedValue(new Error("abandon_failed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "intent" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: /Exit setup/i }));
    await user.click(screen.getByRole("button", { name: /Confirm exit/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't exit/i));
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(mocks.abandon).toHaveBeenCalledWith({ setupId });
  });

  it("keeps a completion handoff when abandon resolves after completion", async () => {
    let resolveAbandon!: (response: unknown) => void;
    const user = userEvent.setup();
    mocks.abandon.mockReturnValue(
      new Promise((resolve) => {
        resolveAbandon = resolve;
      }),
    );
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Exit setup" }));
    await user.click(screen.getByRole("button", { name: "Confirm exit" }));
    await waitFor(() => expect(mocks.abandon).toHaveBeenCalledWith({ setupId }));

    await act(async () => {
      mocks.onBehaviorCompleted?.({
        setup: record({
          completedAt: "2026-08-16T01:00:00Z",
          completionReason: "first_action_completed",
        }),
        concern: { id: "concern-1" },
        actionDeleted: false,
      });
    });
    await waitFor(() => expect(screen.getByText("Your first step was saved.")).toBeInTheDocument());

    resolveAbandon({ setup: record({ completedAt: "2026-08-16T01:01:00Z" }) });
    await waitFor(() => expect(screen.getByText("Your first step was saved.")).toBeInTheDocument());
    expect(screen.queryByText("dog destination")).not.toBeInTheDocument();
  });

  it("keeps the action handoff on failure to abandon", async () => {
    const user = userEvent.setup();
    mocks.abandon.mockRejectedValue(new Error("abandon_failed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: /Exit setup/i }));
    await user.click(screen.getByRole("button", { name: /Confirm exit/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't exit/i));
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
  });

  it("navigates after a successful abandon under StrictMode", async () => {
    let resolveAbandon!: (response: unknown) => void;
    const user = userEvent.setup();
    mocks.abandon.mockReturnValue(
      new Promise((resolve) => {
        resolveAbandon = resolve;
      }),
    );
    renderStrictRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Exit setup" }));
    await user.click(screen.getByRole("button", { name: "Confirm exit" }));
    await waitFor(() => expect(mocks.abandon).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    resolveAbandon({ setup: record({ completedAt: "2026-08-16T01:00:00Z" }) });
    await waitFor(() => expect(screen.getByText("dog destination")).toBeInTheDocument());
  });

  it("shows the abandon error and re-enables controls under StrictMode", async () => {
    let rejectAbandon!: (error: Error) => void;
    const user = userEvent.setup();
    mocks.abandon.mockReturnValue(
      new Promise((_, reject) => {
        rejectAbandon = reject;
      }),
    );
    renderStrictRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Exit setup" }));
    await user.click(screen.getByRole("button", { name: "Confirm exit" }));
    await waitFor(() => expect(mocks.abandon).toHaveBeenCalledTimes(1));

    rejectAbandon(new Error("abandon_failed"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't exit/i));
    expect(screen.getByRole("button", { name: "Back" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip this step" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirm exit" })).not.toBeDisabled();
  });

  it("blocks action, skip, and back while abandon is pending under StrictMode", async () => {
    let resolveAbandon!: (response: unknown) => void;
    const user = userEvent.setup();
    mocks.abandon.mockReturnValue(
      new Promise((resolve) => {
        resolveAbandon = resolve;
      }),
    );
    renderStrictRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Exit setup" }));
    await user.click(screen.getByRole("button", { name: "Confirm exit" }));
    await waitFor(() => expect(mocks.abandon).toHaveBeenCalledTimes(1));

    const saveButton = screen.getAllByRole("button", { name: "Saving…" })[0];
    if (!saveButton) throw new Error("Expected the action save button to be present");
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip this step" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip this step" }));
    fireEvent.submit(saveButton.closest("form") as HTMLFormElement);
    expect(mocks.skip).not.toHaveBeenCalled();
    expect(mocks.completeBehavior).not.toHaveBeenCalled();

    resolveAbandon({ setup: record({ completedAt: "2026-08-16T01:00:00Z" }) });
    await waitFor(() => expect(screen.getByText("dog destination")).toBeInTheDocument());
  });

  it("blocks action controls while abandon is pending and restores values after failure", async () => {
    let rejectAbandon!: (error: Error) => void;
    const user = userEvent.setup();
    mocks.abandon.mockReturnValue(
      new Promise((_, reject) => {
        rejectAbandon = reject;
      }),
    );
    mocks.completeBehavior.mockRejectedValue(new Error("behavior_failed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    const concern = screen.getByLabelText("What concern would you like to understand?");
    await user.type(concern, "Barking at visitors");
    await user.click(screen.getByRole("button", { name: "Exit setup" }));
    await user.click(screen.getByRole("button", { name: "Confirm exit" }));
    await waitFor(() => expect(mocks.abandon).toHaveBeenCalledTimes(1));

    const saveButton = screen.getAllByRole("button", { name: "Saving…" })[0];
    const form = saveButton?.closest("form");
    expect(form).not.toBeNull();
    expect(saveButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip this step" })).toBeDisabled();
    fireEvent.submit(form as HTMLFormElement);
    expect(mocks.completeBehavior).not.toHaveBeenCalled();
    expect(mocks.skip).not.toHaveBeenCalled();
    expect(screen.getByLabelText("What concern would you like to understand?")).toHaveValue(
      "Barking at visitors",
    );

    rejectAbandon(new Error("abandon_failed"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't exit/i));
    expect(screen.getByRole("button", { name: "Save first step" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Skip this step" })).not.toBeDisabled();
    expect(screen.getByLabelText("What concern would you like to understand?")).toHaveValue(
      "Barking at visitors",
    );
  });

  it("blocks intent saves while abandon is pending and preserves the selection after failure", async () => {
    let rejectAbandon!: (error: Error) => void;
    const user = userEvent.setup();
    mocks.abandon.mockReturnValue(
      new Promise((_, reject) => {
        rejectAbandon = reject;
      }),
    );
    mocks.saveIntent.mockResolvedValue({
      setup: record({ currentStep: "action", intent: "track_progress" }),
    });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "intent" }),
        autoStartEligible: false,
      }),
    );

    const track = screen.getByRole("radio", { name: /Track progress/i });
    await user.click(track);
    await user.click(screen.getByRole("button", { name: "Exit setup" }));
    await user.click(screen.getByRole("button", { name: "Confirm exit" }));
    await waitFor(() => expect(mocks.abandon).toHaveBeenCalledTimes(1));

    const continueButton = screen.getAllByRole("button", { name: "Saving…" })[0];
    const form = continueButton?.closest("form");
    expect(form).not.toBeNull();
    expect(continueButton).toBeDisabled();
    fireEvent.submit(form as HTMLFormElement);
    expect(mocks.saveIntent).not.toHaveBeenCalled();
    expect(track).toBeChecked();

    rejectAbandon(new Error("abandon_failed"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't exit/i));
    expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled();
    expect(track).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(mocks.saveIntent).toHaveBeenCalledWith({
        setupId,
        intent: "track_progress",
      }),
    );
  });

  it("serializes abandon behind a pending behavior action and recovers after rejection", async () => {
    let rejectMutation!: (error: Error) => void;
    const user = userEvent.setup();
    mocks.completeBehavior.mockReturnValue(
      new Promise((_, reject) => {
        rejectMutation = reject;
      }),
    );
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    await user.type(screen.getByLabelText("What concern would you like to understand?"), "Barking");
    await user.click(screen.getByRole("button", { name: "Save first step" }));
    await waitFor(() => expect(mocks.completeBehavior).toHaveBeenCalledTimes(1));

    const exitButton = screen.getByRole("button", { name: "Exit setup" });
    expect(exitButton).toBeDisabled();
    await user.click(exitButton);
    expect(screen.queryByRole("button", { name: "Confirm exit" })).not.toBeInTheDocument();

    rejectMutation(new Error("behavior_failed"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn't save/i));
    expect(exitButton).not.toBeDisabled();

    await user.click(exitButton);
    expect(screen.getByRole("button", { name: "Confirm exit" })).toBeInTheDocument();
  });

  it("does not abandon when an action starts while exit confirmation is open", async () => {
    let rejectMutation!: (error: Error) => void;
    const user = userEvent.setup();
    mocks.completeBehavior.mockReturnValue(
      new Promise((_, reject) => {
        rejectMutation = reject;
      }),
    );
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    const exitButton = screen.getByRole("button", { name: "Exit setup" });
    await user.click(exitButton);
    const confirmButton = screen.getByRole("button", { name: "Confirm exit" });
    await user.type(screen.getByLabelText("What concern would you like to understand?"), "Barking");
    await user.click(screen.getByRole("button", { name: "Save first step" }));
    await waitFor(() => expect(mocks.completeBehavior).toHaveBeenCalledTimes(1));

    expect(confirmButton).toBeDisabled();
    await user.click(confirmButton);
    expect(mocks.abandon).not.toHaveBeenCalled();

    rejectMutation(new Error("behavior_failed"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn't save/i));
    expect(confirmButton).not.toBeDisabled();
  });

  it("redirects after reconciling a completed abandon conflict", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({
      data: status({
        active: null,
        latest: record({ completedAt: "2026-08-16T01:00:00Z" }),
        autoStartEligible: false,
      }),
    });
    mocks.useGuidedSetup.mockReturnValue({
      data: status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
      isLoading: false,
      isError: false,
      refetch,
    });
    mocks.abandon.mockRejectedValue(new Error("setup_already_completed"));
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <LocaleProvider>
          <MemoryRouter initialEntries={["/my/setup"]}>
            <Routes>
              <Route path="/my/setup" element={<GuidedSetup allowNewDog={false} />} />
              <Route path="/my" element={<p>overview destination</p>} />
            </Routes>
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Exit setup/i }));
    await user.click(screen.getByRole("button", { name: /Confirm exit/i }));

    await waitFor(() => expect(screen.getByText("overview destination")).toBeInTheDocument());
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the completion conflict when abandon reconciliation returns an error result", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({
      data: status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
      isError: true,
      error: new Error("load_failed"),
    });
    mocks.abandon.mockRejectedValue(new Error("setup_already_completed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
      false,
      { refetch },
    );

    await user.click(screen.getByRole("button", { name: /Exit setup/i }));
    await user.click(screen.getByRole("button", { name: /Confirm exit/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/This guided setup is already complete/i),
    );
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
    expect(screen.queryByText("overview destination")).not.toBeInTheDocument();
  });

  it("shows the completion conflict when abandon reconciliation rejects", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockRejectedValue(new Error("load_failed"));
    mocks.abandon.mockRejectedValue(new Error("setup_already_completed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
      false,
      { refetch },
    );

    await user.click(screen.getByRole("button", { name: /Exit setup/i }));
    await user.click(screen.getByRole("button", { name: /Confirm exit/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/This guided setup is already complete/i),
    );
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    expect(screen.queryByText("overview destination")).not.toBeInTheDocument();
  });

  it("keeps the minimal setup layout free of the main nav and companion", () => {
    mocks.useSession.mockReturnValue({
      data: { user: { email: "owner@example.com", emailVerified: true } },
      isPending: false,
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LocaleProvider>
          <MemoryRouter>
            <GuidedSetupLayout />
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText("TuringCare")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Menu" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Turing/i })).not.toBeInTheDocument();
  });

  it("clears owner-scoped query cache after a successful sign out", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    queryClient.setQueryData(guidedSetupKey, { active: record() });
    queryClient.setQueryData(["dogs"], [{ id: "dog-1", name: "Biscuit" }]);
    mocks.signOut.mockImplementation(async () => {
      expect(queryClient.getQueryData(guidedSetupKey)).toBeDefined();
    });
    mocks.useSession.mockReturnValue({
      data: { user: { email: "owner@example.com", emailVerified: true } },
      isPending: false,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <MemoryRouter initialEntries={["/my/setup"]}>
            <Routes>
              <Route path="/my/setup" element={<GuidedSetupLayout />} />
              <Route path="/login" element={<p>login destination</p>} />
            </Routes>
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(screen.getByText("login destination")).toBeInTheDocument());
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(guidedSetupKey)).toBeUndefined();
    expect(queryClient.getQueryData(["dogs"])).toBeUndefined();
  });

  it("shows the behavior action fields and submits the exact setup-bound payload", async () => {
    const user = userEvent.setup();
    mocks.completeBehavior.mockResolvedValue({
      setup: record({
        currentStep: "action",
        intent: "understand_behavior",
        completedAt: "2026-08-16T01:00:00Z",
        completionReason: "first_action_completed",
        firstActionType: "behavior",
        firstActionId: "concern-1",
      }),
      concern: { id: "concern-1" },
      actionDeleted: false,
    });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    expect(screen.getByLabelText("What concern would you like to understand?")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Severity" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Safety signal" })).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("What concern would you like to understand?"),
      "Barking at the window",
    );
    await user.selectOptions(screen.getByRole("combobox", { name: "Severity" }), "mild");
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() =>
      expect(mocks.completeBehavior).toHaveBeenCalledWith({
        setupId,
        concern: "Barking at the window",
        severity: "mild",
        safetySignal: null,
        safetyConfirmed: false,
      }),
    );
    expect(screen.getByText("Your first step was saved.")).toBeInTheDocument();
  });

  it("keeps action completion visible when refetch clears the active setup before mutation settles", async () => {
    const user = userEvent.setup();
    const queryState: {
      data: GuidedSetupStatus;
      isLoading: boolean;
      isError: boolean;
      refetch: ReturnType<typeof vi.fn>;
    } = {
      data: status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    mocks.useGuidedSetup.mockImplementation(() => queryState);
    mocks.completeBehavior.mockResolvedValue({
      setup: record({
        currentStep: "action",
        intent: "understand_behavior",
        completedAt: "2026-08-16T01:00:00Z",
        completionReason: "first_action_completed",
        firstActionType: "behavior",
        firstActionId: "concern-1",
      }),
      concern: { id: "concern-1" },
      actionDeleted: false,
    });
    const renderResult = render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        {routeTree("/my/setup", false)}
      </QueryClientProvider>,
    );
    mocks.afterComplete.mockImplementation(() => {
      queryState.data = status({ active: null, autoStartEligible: false });
      renderResult.rerender(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          {routeTree("/my/setup", false)}
        </QueryClientProvider>,
      );
    });

    await user.type(screen.getByLabelText("What concern would you like to understand?"), "Barking");
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() => expect(screen.getByText("Your first step was saved.")).toBeInTheDocument());
    expect(screen.queryByText("overview destination")).not.toBeInTheDocument();
  });

  it("requires safety confirmation for severe behavior and selected safety signals", async () => {
    const user = userEvent.setup();
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    const concern = screen.getByLabelText("What concern would you like to understand?");
    const severity = screen.getByRole("combobox", { name: "Severity" });
    const safetySignal = screen.getByRole("combobox", { name: "Safety signal" });
    await user.type(concern, "Growling when handled");
    await user.selectOptions(severity, "severe");
    expect(screen.getByRole("checkbox", { name: /confirm/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please confirm the safety information before saving.",
    );
    expect(mocks.completeBehavior).not.toHaveBeenCalled();

    await user.selectOptions(safetySignal, "injury_or_pain");
    expect(screen.getByRole("option", { name: "Signs of pain or injury" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /confirm/i })).toBeInTheDocument();
  });

  it("requires fresh safety confirmation after severity changes", async () => {
    const user = userEvent.setup();
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    const severity = screen.getByRole("combobox", { name: "Severity" });
    await user.selectOptions(severity, "severe");
    await user.click(screen.getByRole("checkbox", { name: /confirm/i }));
    await user.selectOptions(severity, "moderate");
    await user.selectOptions(severity, "severe");

    expect(screen.getByRole("checkbox", { name: /confirm/i })).not.toBeChecked();
  });

  it("shows accessible localized behavior validation errors", async () => {
    const user = userEvent.setup();
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    const concern = screen.getByLabelText("What concern would you like to understand?");
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    expect(concern).toHaveAttribute("aria-invalid", "true");
    expect(concern).toHaveAttribute("aria-describedby", "guided-setup-concern-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Describe a concern before continuing.");
  });

  it("sends one behavior mutation for rapid duplicate submits", async () => {
    let resolveMutation!: (value: unknown) => void;
    mocks.completeBehavior.mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    const concern = screen.getByLabelText("What concern would you like to understand?");
    fireEvent.change(concern, { target: { value: "Barking" } });
    const form = screen.getByRole("button", { name: "Save first step" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(mocks.completeBehavior).toHaveBeenCalledTimes(1));
    resolveMutation({
      setup: record({ completedAt: "2026-08-16T01:00:00Z" }),
      concern: { id: "concern-1" },
      actionDeleted: false,
    });
    await waitFor(() => expect(screen.getByText("Your first step was saved.")).toBeInTheDocument());
  });

  it("sends one progress mutation for rapid duplicate submits", async () => {
    let resolveMutation!: (value: unknown) => void;
    mocks.completeProgress.mockReturnValue(
      new Promise((resolve) => {
        resolveMutation = resolve;
      }),
    );
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "track_progress" }),
        autoStartEligible: false,
      }),
    );

    fireEvent.click(screen.getByRole("radio", { name: "Better" }));
    const note = screen.getByRole("textbox", { name: "Short note" });
    fireEvent.change(note, { target: { value: "Settled faster." } });
    const form = screen.getByRole("button", { name: "Save first step" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(mocks.completeProgress).toHaveBeenCalledTimes(1));
    resolveMutation({
      setup: record({ completedAt: "2026-08-16T01:00:00Z" }),
      entry: { id: "entry-1" },
      actionDeleted: false,
    });
    await waitFor(() => expect(screen.getByText("Your first step was saved.")).toBeInTheDocument());
  });

  it("retains behavior values after a rejected mutation", async () => {
    const user = userEvent.setup();
    mocks.completeBehavior.mockRejectedValue(new Error("behavior_failed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    const concern = screen.getByLabelText("What concern would you like to understand?");
    await user.type(concern, "Barking at visitors");
    await user.selectOptions(screen.getByRole("combobox", { name: "Severity" }), "moderate");
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn't save/i));
    expect(concern).toHaveValue("Barking at visitors");
    expect(screen.getByRole("combobox", { name: "Severity" })).toHaveValue("moderate");
  });

  it("shows progress fields and submits the exact setup-bound payload", async () => {
    const user = userEvent.setup();
    mocks.completeProgress.mockResolvedValue({
      setup: record({
        currentStep: "action",
        intent: "track_progress",
        completedAt: "2026-08-16T01:00:00Z",
        completionReason: "first_action_completed",
        firstActionType: "progress",
        firstActionId: "entry-1",
      }),
      entry: { id: "entry-1" },
      actionDeleted: false,
    });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "track_progress" }),
        autoStartEligible: false,
      }),
    );

    const better = screen.getByRole("radio", { name: "Better" });
    await user.click(better);
    await user.type(screen.getByLabelText("Short note"), "Settled faster after dinner.");
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() =>
      expect(mocks.completeProgress).toHaveBeenCalledWith({
        setupId,
        trend: "better",
        note: "Settled faster after dinner.",
      }),
    );
    expect(screen.getByText("Your first step was saved.")).toBeInTheDocument();
  });

  it("retains progress values and shows a localized error when progress mutation is rejected", async () => {
    const user = userEvent.setup();
    mocks.completeProgress.mockRejectedValue(new Error("progress_failed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "track_progress" }),
        autoStartEligible: false,
      }),
    );

    expect(screen.getByRole("radiogroup", { name: "How are things going?" })).toBeInTheDocument();
    const better = screen.getByRole("radio", { name: "Better" });
    expect(screen.getByRole("radio", { name: "Same" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Harder" })).toBeInTheDocument();

    await user.click(better);
    const note = screen.getByRole("textbox", { name: "Short note" });
    await user.type(note, "Settled faster.");
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Couldn't save your first step. Your entries are still here.",
      ),
    );
    expect(better).toBeChecked();
    expect(note).toHaveValue("Settled faster.");
    expect(mocks.completeProgress).toHaveBeenCalledWith({
      setupId,
      trend: "better",
      note: "Settled faster.",
    });
  });

  it("reconciles a progress conflict to the server-selected action", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({
      data: status({
        active: record({ currentStep: "intent", intent: null }),
        autoStartEligible: false,
      }),
    });
    mocks.completeProgress.mockRejectedValue(new Error("intent_mismatch"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "track_progress" }),
        autoStartEligible: false,
      }),
      false,
      { refetch },
    );

    await user.click(screen.getByRole("radio", { name: "Better" }));
    await user.type(screen.getByRole("textbox", { name: "Short note" }), "Settled faster.");
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() => expect(screen.getByText("Step 2 of 3")).toBeInTheDocument());
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("requires a progress trend and note with accessible errors", async () => {
    const user = userEvent.setup();
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "track_progress" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Save first step" }));

    expect(screen.getByText("Choose how things are going.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Short note" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("textbox", { name: "Short note" })).toHaveAttribute(
      "aria-describedby",
      "guided-setup-note-error",
    );
    expect(mocks.completeProgress).not.toHaveBeenCalled();
  });

  it("returns to intent before completion and saves a changed intent", async () => {
    const user = userEvent.setup();
    mocks.saveIntent.mockResolvedValue({
      setup: record({ currentStep: "action", intent: "track_progress" }),
    });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Track progress/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(mocks.saveIntent).toHaveBeenCalledWith({
        setupId,
        intent: "track_progress",
      }),
    );
    expect(screen.getByRole("radio", { name: "Better" })).toBeInTheDocument();
  });

  it("skips the action with the exact setup id and keeps the completion handoff visible", async () => {
    const user = userEvent.setup();
    mocks.skip.mockResolvedValue({
      setup: record({
        completedAt: "2026-08-16T01:00:00Z",
        completionReason: "skipped",
      }),
    });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "track_progress" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Skip this step" }));

    await waitFor(() => expect(mocks.skip).toHaveBeenCalledWith({ setupId }));
    expect(screen.getByText("You skipped your first step.")).toBeInTheDocument();
    expect(screen.queryByText("overview destination")).not.toBeInTheDocument();
  });

  it("keeps behavior values and shows a localized skip error when skip is rejected", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mocks.skip.mockRejectedValue(new Error("skip_failed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
      false,
      { refetch },
    );

    const concern = screen.getByLabelText("What concern would you like to understand?");
    await user.type(concern, "Barking at visitors");
    const severity = screen.getByRole("combobox", { name: "Severity" });
    await user.selectOptions(severity, "moderate");
    await user.click(screen.getByRole("button", { name: "Skip this step" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Couldn't skip this step. Please try again.",
      ),
    );
    expect(
      screen.getByRole("heading", { name: /Take the first step toward understanding/i }),
    ).toBeInTheDocument();
    expect(concern).toHaveValue("Barking at visitors");
    expect(severity).toHaveValue("moderate");
    expect(screen.queryByText("You skipped your first step.")).not.toBeInTheDocument();
    expect(mocks.skip).toHaveBeenCalledWith({ setupId });
    expect(refetch).not.toHaveBeenCalled();
  });

  it("reconciles a skip conflict to the server-selected action", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({
      data: status({
        active: record({ currentStep: "action", intent: "track_progress" }),
        autoStartEligible: false,
      }),
    });
    mocks.skip.mockRejectedValue(new Error("setup_not_ready_for_completion"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
      false,
      { refetch },
    );

    await user.click(screen.getByRole("button", { name: "Skip this step" }));

    await waitFor(() => expect(screen.getByRole("radio", { name: "Better" })).toBeInTheDocument());
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
    expect(
      screen.queryByText("Couldn't skip this step. Please try again."),
    ).not.toBeInTheDocument();
  });

  it("redirects after a skip conflict finds a completed setup", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn().mockResolvedValue({
      data: status({
        active: null,
        latest: record({ completedAt: "2026-08-16T01:00:00Z" }),
        autoStartEligible: false,
      }),
    });
    mocks.skip.mockRejectedValue(new Error("setup_already_completed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
      false,
      { refetch },
    );

    await user.click(screen.getByRole("button", { name: "Skip this step" }));

    await waitFor(() => expect(screen.getByText("overview destination")).toBeInTheDocument());
    expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
  });

  it("clears a failed skip after going back and saving a different intent", async () => {
    const user = userEvent.setup();
    mocks.skip.mockRejectedValue(new Error("skip_failed"));
    mocks.saveIntent.mockResolvedValue({
      setup: record({ currentStep: "action", intent: "track_progress" }),
    });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Skip this step" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Couldn't skip this step. Please try again.",
      ),
    );

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("radio", { name: /Track progress/ }));
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(screen.getByRole("radio", { name: "Better" })).toBeInTheDocument());
    expect(
      screen.queryByText("Couldn't skip this step. Please try again."),
    ).not.toBeInTheDocument();
  });

  it("keeps progress values and shows a localized skip error when skip is rejected", async () => {
    const user = userEvent.setup();
    mocks.skip.mockRejectedValue(new Error("skip_failed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "track_progress" }),
        autoStartEligible: false,
      }),
    );

    const better = screen.getByRole("radio", { name: "Better" });
    await user.click(better);
    const note = screen.getByRole("textbox", { name: "Short note" });
    await user.type(note, "Settled faster.");
    await user.click(screen.getByRole("button", { name: "Skip this step" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Couldn't skip this step. Please try again.",
      ),
    );
    expect(
      screen.getByRole("heading", { name: /Take the first step toward tracking progress/i }),
    ).toBeInTheDocument();
    expect(better).toBeChecked();
    expect(note).toHaveValue("Settled faster.");
    expect(screen.queryByText("You skipped your first step.")).not.toBeInTheDocument();
    expect(mocks.skip).toHaveBeenCalledWith({ setupId });
  });

  it("renders a safe tombstone completion without claiming the deleted action was saved", async () => {
    const user = userEvent.setup();
    mocks.completeBehavior.mockResolvedValue({
      setup: record({
        completedAt: "2026-08-16T01:00:00Z",
        completionReason: "first_action_completed",
      }),
      concern: null,
      actionDeleted: true,
    });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "understand_behavior" }),
        autoStartEligible: false,
      }),
    );

    await user.type(screen.getByLabelText("What concern would you like to understand?"), "Barking");
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() =>
      expect(
        screen.getByText("Your first-step record is no longer available."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Your first step was saved.")).not.toBeInTheDocument();
  });

  it("shows the allowlisted training templates for the train skill path", async () => {
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "train_skill" }),
        autoStartEligible: false,
      }),
    );

    expect(screen.getByText("Basic Manners")).toBeInTheDocument();
    expect(screen.getByText("Puppy Fundamentals")).toBeInTheDocument();
    expect(screen.getByText("Recall Reliability")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save first step" })).toBeDisabled();
    expect(mocks.completeBehavior).not.toHaveBeenCalled();
    expect(mocks.completeProgress).not.toHaveBeenCalled();
  });

  it("captures a training completion suggestion before invalidation and renders a preview only", async () => {
    const user = userEvent.setup();
    const suggestion = trainingSuggestion();
    mocks.completeTraining.mockResolvedValue({
      setup: record({
        currentStep: "action",
        intent: "train_skill",
        completedAt: "2026-08-16T01:00:00Z",
        completionReason: "first_action_completed",
        firstActionType: "training",
        firstActionId: "goal-1",
      }),
      goal: { id: "goal-1" },
      skills: [],
      focus: null,
      suggestion,
      actionDeleted: false,
    });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "train_skill" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("radio", { name: /Basic Manners/ }));
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() => expect(screen.getByText("Your first step was saved.")).toBeInTheDocument());
    expect(screen.getAllByText("Lure into a sit in a quiet room.")).toHaveLength(2);
    expect(screen.queryByText("We did this")).not.toBeInTheDocument();
    expect(screen.queryByText("Choose a different focus")).not.toBeInTheDocument();
    expect(mocks.completeTraining).toHaveBeenCalledTimes(1);
  });

  it("renders a saved training completion without a historical suggestion preview", async () => {
    const user = userEvent.setup();
    mocks.completeTraining.mockResolvedValue({
      setup: record({
        currentStep: "action",
        intent: "train_skill",
        completedAt: "2026-08-16T01:00:00Z",
        completionReason: "first_action_completed",
        firstActionType: "training",
        firstActionId: "goal-1",
      }),
      goal: { id: "goal-1" },
      skills: [],
      focus: null,
      suggestion: null,
      actionDeleted: false,
    });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "train_skill" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("radio", { name: /Basic Manners/ }));
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() => expect(screen.getByText("Your first step was saved.")).toBeInTheDocument());
    expect(
      screen.queryByRole("heading", { name: "This week's suggestion" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Your first-step record is no longer available."),
    ).not.toBeInTheDocument();
  });

  it("renders a safe tombstone for a deleted training completion", async () => {
    const user = userEvent.setup();
    mocks.completeTraining.mockResolvedValue({
      setup: record({
        dogId: null,
        dogName: null,
        currentStep: "action",
        intent: "train_skill",
        completedAt: "2026-08-16T01:00:00Z",
        completionReason: "first_action_completed",
        firstActionType: "training",
        firstActionId: "goal-1",
      }),
      goal: null,
      skills: [],
      focus: null,
      suggestion: null,
      actionDeleted: true,
    });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "train_skill" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("radio", { name: /Basic Manners/ }));
    await user.click(screen.getByRole("button", { name: "Save first step" }));

    await waitFor(() =>
      expect(
        screen.getByText("Your first-step record is no longer available."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Lure into a sit in a quiet room.")).not.toBeInTheDocument();
    expect(screen.queryByText("We did this")).not.toBeInTheDocument();
  });

  it("skips train skill with the exact setup id and enters completion", async () => {
    const user = userEvent.setup();
    mocks.skip.mockResolvedValue({
      setup: record({
        completedAt: "2026-08-16T01:00:00Z",
        completionReason: "skipped",
      }),
    });
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "train_skill" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Skip this step" }));

    await waitFor(() => expect(mocks.skip).toHaveBeenCalledWith({ setupId }));
    expect(screen.getByText("You skipped your first step.")).toBeInTheDocument();
    expect(screen.queryByText("Basic Manners")).not.toBeInTheDocument();
  });

  it("keeps training options and shows a localized skip error when skip is rejected", async () => {
    const user = userEvent.setup();
    mocks.skip.mockRejectedValue(new Error("skip_failed"));
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "train_skill" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Skip this step" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Couldn't skip this step. Please try again.",
      ),
    );
    expect(screen.getByText("Basic Manners")).toBeInTheDocument();
    expect(screen.queryByText("You skipped your first step.")).not.toBeInTheDocument();
    expect(mocks.skip).toHaveBeenCalledWith({ setupId });
  });

  it("disables train abandon while skip is pending and recovers after rejection", async () => {
    let rejectSkip!: (error: Error) => void;
    const user = userEvent.setup();
    mocks.skip.mockReturnValue(
      new Promise((_, reject) => {
        rejectSkip = reject;
      }),
    );
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "train_skill" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Skip this step" }));
    await waitFor(() => expect(mocks.skip).toHaveBeenCalledTimes(1));

    const exitButton = screen.getByRole("button", { name: "Exit setup" });
    expect(exitButton).toBeDisabled();
    await user.click(exitButton);
    expect(screen.queryByRole("button", { name: "Confirm exit" })).not.toBeInTheDocument();

    rejectSkip(new Error("skip_failed"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/couldn't skip/i));
    expect(exitButton).not.toBeDisabled();
  });

  it("blocks the train placeholder skip while abandon is pending and recovers after failure", async () => {
    let rejectAbandon!: (error: Error) => void;
    const user = userEvent.setup();
    mocks.abandon.mockReturnValue(
      new Promise((_, reject) => {
        rejectAbandon = reject;
      }),
    );
    renderRoute(
      "/my/setup",
      status({
        active: record({ currentStep: "action", intent: "train_skill" }),
        autoStartEligible: false,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Exit setup" }));
    await user.click(screen.getByRole("button", { name: "Confirm exit" }));
    await waitFor(() => expect(mocks.abandon).toHaveBeenCalledTimes(1));

    const skipButton = screen.getByRole("button", { name: "Skip this step" });
    expect(skipButton).toBeDisabled();
    fireEvent.click(skipButton);
    expect(mocks.skip).not.toHaveBeenCalled();

    rejectAbandon(new Error("abandon_failed"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Couldn't exit/i));
    expect(skipButton).not.toBeDisabled();
  });

  it("renders Spanish behavior action copy", () => {
    const languages = navigator.languages;
    try {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        value: ["es-MX"],
      });
      renderRoute(
        "/my/setup",
        status({
          active: record({ currentStep: "action", intent: "understand_behavior" }),
          autoStartEligible: false,
        }),
      );

      expect(
        screen.getByRole("heading", { name: /Da el primer paso para entender su conducta/i }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("¿Qué conducta quieres entender?")).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        value: languages,
      });
    }
  });

  it("renders Spanish training action copy", () => {
    const languages = navigator.languages;
    try {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        value: ["es-MX"],
      });
      renderRoute(
        "/my/setup",
        status({
          active: record({ currentStep: "action", intent: "train_skill" }),
          autoStartEligible: false,
        }),
      );

      expect(
        screen.getByRole("heading", {
          name: /Da el primer paso para entrenar una habilidad/i,
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("Elige una plantilla de entrenamiento")).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        value: languages,
      });
    }
  });

  it("renders Spanish progress action copy", () => {
    const languages = navigator.languages;
    try {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        value: ["es-MX"],
      });
      renderRoute(
        "/my/setup",
        status({
          active: record({ currentStep: "action", intent: "track_progress" }),
          autoStartEligible: false,
        }),
      );

      expect(
        screen.getByRole("heading", {
          name: /Da el primer paso para dar seguimiento al progreso/i,
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("¿Cómo va todo?")).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "Mejor" })).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, "languages", {
        configurable: true,
        value: languages,
      });
    }
  });
});
