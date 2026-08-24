import { LocaleProvider } from "@/i18n";
import type { FocusSkill } from "@/lib/weekly-focus";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeekGrid } from "./week-grid";

function renderGrid(locale: "en" | "es", sessionCount: number) {
  localStorage.setItem("tc-locale", locale);
  const day = new Date(2026, 4, 18, 12);
  const focusSkills: FocusSkill[] = [
    {
      skillId: "s1",
      name: "Recall",
      goalId: "g1",
      goalName: "Reliability",
      position: 0,
      currentLevel: 1,
      dimensions: [],
      contextualProgress: {
        status: "ready",
        summary: { strongestContext: null, nextPracticeAction: null, safety: null },
      },
      sessions: Array.from({ length: sessionCount }, (_, index) => ({
        id: `session-${index + 1}`,
        occurredAt: day.toISOString(),
        durationMinutes: 5,
      })),
    },
  ];

  render(
    <LocaleProvider>
      <WeekGrid
        focusSkills={focusSkills}
        days={[day]}
        today={day}
        onLog={vi.fn()}
        onRemove={vi.fn()}
      />
    </LocaleProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
});

describe("WeekGrid session-count accessibility label", () => {
  it.each([
    ["en", 1, "Recall on Monday, May 18, 2026: 1 session", "●"],
    ["en", 2, "Recall on Monday, May 18, 2026: 2 sessions", "2"],
    ["es", 1, "Recall el lunes, 18 de mayo de 2026: 1 sesión", "●"],
    ["es", 2, "Recall el lunes, 18 de mayo de 2026: 2 sesiones", "2"],
  ] as const)(
    "uses localized singular and plural copy in %s for %i sessions",
    (locale, sessionCount, accessibleName, visualLabel) => {
      renderGrid(locale, sessionCount);

      expect(screen.getByRole("button", { name: accessibleName })).toHaveTextContent(visualLabel);
    },
  );
});
