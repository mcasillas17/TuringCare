import { LocaleProvider } from "@/i18n";
import * as contextualProgressLib from "@/lib/contextual-progress";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  CONTEXTUAL_PROGRESS_WINDOW_DAYS,
  type ContextualProgressSummary,
} from "@turingcare/shared";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextualProgressSummaryCard } from "./contextual-progress-summary";

vi.mock("@/lib/contextual-progress", async () => {
  const actual = await vi.importActual<typeof import("@/lib/contextual-progress")>(
    "@/lib/contextual-progress",
  );
  return { ...actual, useRecordContextualProgressEvent: vi.fn() };
});

const reliableContext = {
  cueSupport: "verbal_cue" as const,
  environment: "home_quiet" as const,
  distance: "few_steps" as const,
  durationBand: "about_15_seconds" as const,
  distraction: "none" as const,
};

const reliableSummary: ContextualProgressSummary = {
  strongestContext: {
    context: reliableContext,
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
      ...reliableContext,
      distance: "across_room",
    },
    changedDimension: "distance",
  },
};

function renderSummary(
  contextualProgress:
    | { status: "ready"; summary: ContextualProgressSummary }
    | { status: "unavailable" },
) {
  const recordEvent = vi.fn();
  vi.mocked(contextualProgressLib.useRecordContextualProgressEvent).mockReturnValue({
    mutate: recordEvent,
  } as never);
  const result = render(
    <LocaleProvider>
      <MemoryRouter initialEntries={["/my/dogs/dog-1/week"]}>
        <ContextualProgressSummaryCard
          dogId="dog-1"
          skill={{ skillId: "skill-1", name: "Sit", contextualProgress }}
        />
      </MemoryRouter>
    </LocaleProvider>,
  );
  return { recordEvent, ...result };
}

afterEach(() => vi.clearAllMocks());

describe("ContextualProgressSummaryCard", () => {
  it("shows the strongest reliable context and one next-practice action", () => {
    renderSummary({ status: "ready", summary: reliableSummary });

    expect(screen.getByRole("heading", { name: "Sit", level: 2 })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Strongest recent context", level: 3 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Practice next", level: 3 })).toBeInTheDocument();
    expect(screen.getByText("Reliable")).toBeInTheDocument();
    expect(screen.getByText("One step harder")).toBeInTheDocument();
    expect(
      screen.getByText(`Based on the most recent ${CONTEXTUAL_PROGRESS_WINDOW_DAYS} days`),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Distance").length).toBeGreaterThan(0);
  });

  it("shows Developing without a false Reliable label", () => {
    const { strongestContext, nextPracticeAction } = reliableSummary;
    if (!strongestContext || !nextPracticeAction) {
      throw new Error("reliable fixture is incomplete");
    }
    renderSummary({
      status: "ready",
      summary: {
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
      },
    });

    expect(screen.getByText("Developing")).toBeInTheDocument();
    expect(screen.getByText("This context needs more support.")).toBeInTheDocument();
    expect(screen.queryByText("Reliable")).not.toBeInTheDocument();
  });

  it("shows a neutral capture prompt without a Not observed list", () => {
    renderSummary({
      status: "ready",
      summary: { strongestContext: null, nextPracticeAction: null },
    });

    expect(
      screen.getByText(
        "Add an outcome and context after practice to see where this skill is becoming reliable.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Not observed")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Practice next", level: 3 }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View all evidence" })).toHaveAttribute(
      "href",
      "/my/dogs/dog-1/training#skill-skill-1",
    );
  });

  it("omits the next-practice heading when a reliable context has no action", () => {
    renderSummary({
      status: "ready",
      summary: { ...reliableSummary, nextPracticeAction: null },
    });

    expect(screen.getByText("Reliable")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Practice next", level: 3 }),
    ).not.toBeInTheDocument();
  });

  it("uses the recent 21-day label for historical weekly summaries", () => {
    renderSummary({ status: "ready", summary: reliableSummary });

    expect(
      screen.getByText(`Based on the most recent ${CONTEXTUAL_PROGRESS_WINDOW_DAYS} days`),
    ).toBeInTheDocument();
    expect(screen.queryByText(/this week/i)).not.toBeInTheDocument();
  });

  it("records action use but not when viewing all evidence", () => {
    const { recordEvent } = renderSummary({ status: "ready", summary: reliableSummary });

    fireEvent.click(screen.getByRole("link", { name: "Use this practice plan" }));
    expect(recordEvent).toHaveBeenCalledWith({
      name: "training.context_next_action_used",
      surface: "week",
      ruleId: "advance_reliable_context",
      direction: "harder",
    });

    recordEvent.mockClear();
    fireEvent.click(screen.getByRole("link", { name: "View all evidence" }));
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("records one insight view for the mounted weekly summary", () => {
    const { recordEvent, rerender } = renderSummary({
      status: "ready",
      summary: reliableSummary,
    });

    expect(recordEvent).toHaveBeenCalledWith({
      name: "training.context_insight_viewed",
      surface: "week",
      strongestStatus: "reliable",
      hasNextAction: true,
    });
    recordEvent.mockClear();

    rerender(
      <LocaleProvider>
        <MemoryRouter initialEntries={["/my/dogs/dog-1/week"]}>
          <ContextualProgressSummaryCard
            dogId="dog-1"
            skill={{
              skillId: "skill-1",
              name: "Sit",
              contextualProgress: { status: "ready", summary: reliableSummary },
            }}
          />
        </MemoryRouter>
      </LocaleProvider>,
    );

    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("keeps an unavailable summary inline instead of hiding practice controls", () => {
    renderSummary({ status: "unavailable" });

    expect(screen.getByRole("status")).toHaveTextContent("Couldn't load context progress.");
    expect(screen.getByRole("link", { name: "View all evidence" })).toHaveAttribute(
      "href",
      "/my/dogs/dog-1/training#skill-skill-1",
    );
  });
});
