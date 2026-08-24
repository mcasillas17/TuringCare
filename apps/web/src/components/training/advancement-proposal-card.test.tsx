import { LocaleProvider } from "@/i18n";
import { render, screen } from "@testing-library/react";
import type { AdvancementProposalDto } from "@turingcare/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdvancementProposalCard } from "./advancement-proposal-card";

const proposal: AdvancementProposalDto = {
  id: "p1",
  skillId: "s1",
  fromLevel: 1,
  toLevel: 2,
  ruleId: "recent_success_at_level",
  status: "proposed",
  sessionCount: 1,
  dayCount: 1,
  windowDays: 21,
  supportingSessions: [
    {
      id: "ps1",
      occurredAt: "not-a-date",
      practiceDay: "not-a-date",
      outcome: "went_well",
    },
  ],
  createdAt: "2026-08-13T00:00:00.000Z",
  decidedAt: null,
};

afterEach(() => {
  localStorage.clear();
});

describe("AdvancementProposalCard", () => {
  it("renders a localized fallback when supporting evidence has an invalid date", () => {
    localStorage.setItem("tc-locale", "es");

    render(
      <LocaleProvider>
        <AdvancementProposalCard proposal={proposal} skillName="Sentarse" onDecision={vi.fn()} />
      </LocaleProvider>,
    );

    expect(screen.getByText("No disponible")).toBeInTheDocument();
  });
});
