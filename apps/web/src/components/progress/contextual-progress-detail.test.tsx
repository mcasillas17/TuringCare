import { LocaleProvider } from "@/i18n";
import * as contextualProgressLib from "@/lib/contextual-progress";
import { fireEvent, render, screen } from "@testing-library/react";
import type {
  ContextualProgress,
  ExactContextEvidence,
  NextPracticeAction,
} from "@turingcare/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ContextualProgressDetail } from "./contextual-progress-detail";

vi.mock("@/lib/contextual-progress", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contextual-progress")>(
    "@/lib/contextual-progress",
  );
  return {
    ...actual,
    useRecordContextualProgressEvent: vi.fn(),
  };
});

const window = {
  startsAt: "2026-07-30T12:00:00.000Z",
  endsAt: "2026-08-20T12:00:00.000Z",
  days: 21 as const,
};

const strongestContext: ExactContextEvidence = {
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
};

const nextPracticeAction: NextPracticeAction = {
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
};

function makeData(overrides: Partial<ContextualProgress> = {}): ContextualProgress {
  return {
    window,
    curriculumLevel: 3,
    curriculumVersion: "2026-08-11",
    policyVersion: "2026-08-20",
    strongestContext,
    nextPracticeAction,
    exactContexts: [strongestContext],
    ...overrides,
  };
}

function setup(
  props: Partial<React.ComponentProps<typeof ContextualProgressDetail>> = {},
  mutate = vi.fn(),
) {
  const onUseNextAction = vi.fn();
  const refetch = vi.fn().mockResolvedValue(undefined);
  vi.mocked(contextualProgressLib.useRecordContextualProgressEvent).mockReturnValue({
    mutate,
  } as never);
  render(
    <LocaleProvider>
      <ContextualProgressDetail
        dogId="dog-1"
        skillId="skill-1"
        data={makeData()}
        isLoading={false}
        isError={false}
        refetch={refetch}
        onUseNextAction={onUseNextAction}
        {...props}
      />
    </LocaleProvider>,
  );
  return { onUseNextAction, refetch };
}

describe("ContextualProgressDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the reliable strongest exact context with window, level, dates, and evidence", () => {
    setup();

    expect(screen.getByRole("heading", { name: "Context progress" })).toBeInTheDocument();
    expect(screen.getByText("Recent 21-day window · Level 3 — Sometimes")).toBeInTheDocument();
    expect(screen.getAllByText("Reliable").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2 successful days").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Last observed: Aug 20").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Spoken cue only").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Quiet room at home").length).toBeGreaterThan(0);
    expect(screen.getAllByText("A few steps away").length).toBeGreaterThan(0);
    expect(screen.getAllByText("About 15 seconds").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nothing much").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Help").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Environment").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Distance").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Duration").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Distraction").length).toBeGreaterThan(0);
  });

  it("describes a latest too-hard developing context as needing more support", () => {
    setup({
      data: makeData({
        strongestContext: {
          ...strongestContext,
          status: "developing",
          latestOutcome: "too_hard",
          successfulDistinctDays: 0,
        },
        nextPracticeAction: {
          ...nextPracticeAction,
          ruleId: "ease_after_too_hard",
          direction: "easier",
        },
      }),
    });

    expect(screen.getByText("Developing")).toBeInTheDocument();
    expect(screen.getByText("This context needs more support.")).toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });

  it("keeps Not observed neutral and explicitly says there is no recent evidence", () => {
    const notObserved: ExactContextEvidence = {
      ...strongestContext,
      status: "not_observed",
      successfulDistinctDays: 0,
      latestOutcome: null,
      lastObservedAt: null,
      lastSuccessfulAt: null,
    };
    setup({
      data: makeData({
        strongestContext: null,
        nextPracticeAction: null,
        exactContexts: [notObserved],
      }),
    });

    expect(screen.getByText("Not observed")).toBeInTheDocument();
    expect(screen.getByText("No recent evidence")).toBeInTheDocument();
    expect(screen.queryByText(/failed/i)).not.toBeInTheDocument();
  });

  it("prompts for structured evidence when the current window is sparse", () => {
    setup({
      data: makeData({ strongestContext: null, nextPracticeAction: null, exactContexts: [] }),
    });

    expect(
      screen.getByText(
        "Add an outcome and context after practice to see where this skill is becoming reliable.",
      ),
    ).toBeInTheDocument();
  });

  it("renders a retryable status without removing the practice action", () => {
    const { refetch } = setup({ data: undefined, isError: true });

    expect(screen.getByRole("status")).toHaveTextContent("Couldn't load context progress.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("announces loading without claiming an insight result", () => {
    setup({ data: undefined, isLoading: true });

    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    expect(screen.queryByText("Reliable")).not.toBeInTheDocument();
  });

  it("records the next-action event before opening the prefilled session form", () => {
    const mutate = vi.fn();
    const { onUseNextAction } = setup({}, mutate);

    fireEvent.click(screen.getByRole("button", { name: "Use this practice plan" }));

    expect(mutate).toHaveBeenCalledWith({
      name: "training.context_next_action_used",
      surface: "skill_detail",
      ruleId: "advance_reliable_context",
      direction: "harder",
    });
    expect(onUseNextAction).toHaveBeenCalledWith(nextPracticeAction.context);
  });

  it("records one view event for one mounted result despite rerenders", () => {
    const mutate = vi.fn();
    vi.mocked(contextualProgressLib.useRecordContextualProgressEvent).mockReturnValue({
      mutate,
    } as never);
    const result = render(
      <LocaleProvider>
        <ContextualProgressDetail
          dogId="dog-1"
          skillId="skill-1"
          data={makeData()}
          isLoading={false}
          isError={false}
          refetch={vi.fn()}
          onUseNextAction={vi.fn()}
        />
      </LocaleProvider>,
    );

    expect(mutate).toHaveBeenCalledWith({
      name: "training.context_insight_viewed",
      surface: "skill_detail",
      strongestStatus: "reliable",
      hasNextAction: true,
    });
    result.rerender(
      <LocaleProvider>
        <ContextualProgressDetail
          dogId="dog-1"
          skillId="skill-1"
          data={makeData()}
          isLoading={false}
          isError={false}
          refetch={vi.fn()}
          onUseNextAction={vi.fn()}
        />
      </LocaleProvider>,
    );

    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
