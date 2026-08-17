import { LocaleProvider } from "@/i18n";
import { fireEvent, render, screen } from "@testing-library/react";
import type { TrainingSuggestion } from "@turingcare/shared";
import { describe, expect, it, vi } from "vitest";
import { SafetyNotice } from "./safety-notice";
import { SuggestionCard } from "./suggestion-card";

const baseSuggestion: TrainingSuggestion = {
  suggestionId: "sug-1",
  dismissed: false,
  type: "exercise",
  ruleId: "cold_start_curriculum_level",
  curriculumVersion: "2026-08-11",
  dogId: "d1",
  weekKey: "2026-08-10",
  skill: {
    id: "s1",
    name: "Sit",
    catalogSkillKey: "basic-manners.sit",
    level: 1,
    goalId: "g1",
    goalName: "Basic manners",
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

const advancementSuggestion: TrainingSuggestion = {
  ...baseSuggestion,
  ruleId: "maintain_current_level",
  advancementProposal: {
    id: "p1",
    skillId: "s1",
    fromLevel: 1,
    toLevel: 2,
    ruleId: "recent_success_at_level",
    status: "proposed",
    sessionCount: 3,
    dayCount: 3,
    windowDays: 21,
    supportingSessions: [
      {
        id: "ps1",
        occurredAt: "2026-08-11T09:00:00.000Z",
        practiceDay: "2026-08-11",
        outcome: "went_well",
      },
      {
        id: "ps2",
        occurredAt: "2026-08-12T09:00:00.000Z",
        practiceDay: "2026-08-12",
        outcome: "went_well",
      },
      {
        id: "ps3",
        occurredAt: "2026-08-13T09:00:00.000Z",
        practiceDay: "2026-08-13",
        outcome: "went_well",
      },
    ],
    createdAt: "2026-08-13T00:00:00.000Z",
    decidedAt: null,
  },
};

function renderCard(
  suggestion: TrainingSuggestion,
  onAction = vi.fn(),
  onDecision = vi.fn(),
  pending: { action?: boolean; decision?: boolean } = {},
) {
  render(
    <LocaleProvider>
      <SuggestionCard
        suggestion={suggestion}
        onAction={onAction}
        onDecision={onDecision}
        onPickFocus={vi.fn()}
        actionPending={pending.action}
        decisionPending={pending.decision}
      />
    </LocaleProvider>,
  );
  return { onAction, onDecision };
}

describe("SuggestionCard", () => {
  it("shows the primary exercise, the fallback and the reason", () => {
    renderCard(baseSuggestion);
    expect(screen.getAllByText("Lure into a sit in a quiet room.")).toHaveLength(2);
    expect(screen.getByText("If that looks like too much")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Starting at step 1 because there's no practice recorded for this exact exercise yet.",
      ),
    ).toBeInTheDocument();
  });

  it("records an owner action", () => {
    const { onAction } = renderCard(baseSuggestion);
    fireEvent.click(screen.getByText("We did this"));
    expect(onAction).toHaveBeenCalledWith("started");
  });

  it("lets the owner replace an ordinary suggestion by changing focus", () => {
    const onPickFocus = vi.fn();
    render(
      <LocaleProvider>
        <SuggestionCard
          suggestion={baseSuggestion}
          onAction={vi.fn()}
          onDecision={vi.fn()}
          onPickFocus={onPickFocus}
        />
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByText("Choose a different focus"));
    expect(onPickFocus).toHaveBeenCalled();
  });

  it("hides a suggestion after the owner skips it", () => {
    renderCard({ ...baseSuggestion, dismissed: true });
    expect(screen.getByText("Skipped for today")).toBeInTheDocument();
    expect(screen.queryByText("Lure into a sit in a quiet room.")).not.toBeInTheDocument();
  });

  it("suppresses exercises and shows referral guidance when safety fires", () => {
    renderCard({
      ...baseSuggestion,
      type: "safety_suppressed",
      ruleId: null,
      primary: null,
      fallback: null,
      safety: {
        suppressed: true,
        ruleId: "reported_aggression_or_bite_risk",
        referral: "veterinary_behaviorist",
      },
    });
    expect(screen.getByText("Let's pause training suggestions")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveAccessibleName("Let's pause training suggestions");
    expect(screen.queryByText("Lure into a sit in a quiet room.")).not.toBeInTheDocument();
    expect(screen.queryByText("We did this")).not.toBeInTheDocument();
    expect(screen.getByText("DACVB — veterinary behaviorists")).toBeInTheDocument();
    expect(screen.queryByText("CCPDT — certified trainers")).not.toBeInTheDocument();
  });

  it("does not show trainer directories for an injury referral", () => {
    renderCard({
      ...baseSuggestion,
      type: "safety_suppressed",
      ruleId: null,
      primary: null,
      fallback: null,
      safety: {
        suppressed: true,
        ruleId: "reported_injury_or_pain",
        referral: "veterinarian",
      },
    });
    expect(screen.queryByText("Where to look")).not.toBeInTheDocument();
    expect(screen.queryByText("CCPDT — certified trainers")).not.toBeInTheDocument();
  });

  it("uses a unique accessible title id for each safety notice", () => {
    const safety = {
      suppressed: true as const,
      ruleId: "reported_injury_or_pain" as const,
      referral: "veterinarian" as const,
    };
    render(
      <LocaleProvider>
        <SafetyNotice safety={safety} />
        <SafetyNotice safety={safety} />
      </LocaleProvider>,
    );

    const titleIds = screen
      .getAllByRole("alert")
      .map((notice) => notice.getAttribute("aria-labelledby"));
    expect(new Set(titleIds).size).toBe(2);
    for (const titleId of titleIds) {
      expect(titleId).not.toBeNull();
      expect(document.getElementById(titleId ?? "")).not.toBeNull();
    }
  });

  it("explains that custom skills are not covered", () => {
    renderCard({
      ...baseSuggestion,
      type: "custom_skill_unsupported",
      ruleId: "custom_skill_unsupported",
      primary: null,
      fallback: null,
      evidenceCategory: null,
    });
    expect(screen.getByText("Custom skill")).toBeInTheDocument();
    expect(screen.queryByText("We did this")).not.toBeInTheDocument();
  });

  it("prompts for a focus skill when the week is empty", () => {
    renderCard({
      ...baseSuggestion,
      type: "needs_focus_skill",
      ruleId: "needs_focus_skill",
      skill: null,
      primary: null,
      fallback: null,
      evidenceCategory: null,
    });
    expect(screen.getByText("Pick a focus skill")).toBeInTheDocument();
    expect(screen.getByText("Choose focus")).toBeInTheDocument();
  });

  it("asks the owner to confirm an advancement proposal", () => {
    const { onDecision } = renderCard(advancementSuggestion);
    expect(screen.getByText("Ready for the next step?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Yes, move up"));
    expect(onDecision).toHaveBeenCalledWith("p1", "confirmed");
  });

  it("disables owner actions while their mutations are pending", () => {
    renderCard(advancementSuggestion, vi.fn(), vi.fn(), { action: true, decision: true });

    expect(screen.getByText("We did this")).toBeDisabled();
    expect(screen.getByText("Yes, move up")).toBeDisabled();
    expect(screen.getByText("Stay at this step")).toBeDisabled();
  });

  it("previews authored exercises without interactive controls", () => {
    render(
      <LocaleProvider>
        <SuggestionCard mode="preview" suggestion={advancementSuggestion} />
      </LocaleProvider>,
    );

    expect(screen.getAllByText("Lure into a sit in a quiet room.")).toHaveLength(2);
    expect(screen.queryByText("We did this")).not.toBeInTheDocument();
    expect(screen.queryByText("Choose a different focus")).not.toBeInTheDocument();
    expect(screen.queryByText("Yes, move up")).not.toBeInTheDocument();
    expect(screen.queryByText("Stay at this step")).not.toBeInTheDocument();
  });

  it("does not fabricate exercise content for malformed preview payloads", () => {
    render(
      <LocaleProvider>
        <SuggestionCard
          mode="preview"
          suggestion={{ ...baseSuggestion, type: "exercise", primary: null, fallback: null }}
        />
      </LocaleProvider>,
    );

    expect(screen.queryByText("Lure into a sit in a quiet room.")).not.toBeInTheDocument();
    expect(screen.queryByText("We did this")).not.toBeInTheDocument();
  });

  it("preserves the safety notice and suppresses exercise text in preview mode", () => {
    render(
      <LocaleProvider>
        <SuggestionCard
          mode="preview"
          suggestion={{
            ...baseSuggestion,
            type: "safety_suppressed",
            ruleId: null,
            primary: null,
            fallback: null,
            safety: {
              suppressed: true,
              ruleId: "reported_injury_or_pain",
              referral: "veterinarian",
            },
          }}
        />
      </LocaleProvider>,
    );

    expect(screen.getByRole("alert")).toHaveAccessibleName("Let's pause training suggestions");
    expect(screen.queryByText("Lure into a sit in a quiet room.")).not.toBeInTheDocument();
    expect(screen.queryByText("We did this")).not.toBeInTheDocument();
  });

  it.each([
    ["dismissed", { ...baseSuggestion, dismissed: true }],
    [
      "needs focus",
      {
        ...baseSuggestion,
        type: "needs_focus_skill" as const,
        ruleId: "needs_focus_skill" as const,
        skill: null,
        primary: null,
        fallback: null,
        evidenceCategory: null,
      },
    ],
    [
      "custom",
      {
        ...baseSuggestion,
        type: "custom_skill_unsupported" as const,
        ruleId: "custom_skill_unsupported" as const,
        primary: null,
        fallback: null,
        evidenceCategory: null,
      },
    ],
  ])("does not show exercise fallback for %s preview states", (_label, suggestion) => {
    render(
      <LocaleProvider>
        <SuggestionCard mode="preview" suggestion={suggestion} />
      </LocaleProvider>,
    );

    expect(screen.queryByText("Lure into a sit in a quiet room.")).not.toBeInTheDocument();
  });
});
