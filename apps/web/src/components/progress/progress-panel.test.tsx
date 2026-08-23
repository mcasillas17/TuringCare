import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import * as progressLib from "@/lib/progress";
import type { ProgressGoal } from "@/lib/progress";
import * as catalogLib from "@/lib/training-catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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

function setup(progressGoals: ProgressGoal[] = goals, locale: "en" | "es" = "en") {
  localStorage.setItem("tc-locale", locale);
  vi.mocked(progressLib.useProgress).mockReturnValue({
    data: progressGoals,
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
  vi.mocked(catalogLib.useTrainingCatalog).mockReturnValue({ data: [] } as unknown as ReturnType<
    typeof catalogLib.useTrainingCatalog
  >);
  vi.mocked(dogsLib.useRemoveGoal).mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<
    typeof dogsLib.useRemoveGoal
  >);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <ProgressPanel dogId="d1" />
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("ProgressPanel", () => {
  it("shows a level badge on the collapsed skill row and the stepper when expanded", () => {
    setup();
    expect(screen.getByText(/Level 3 — Sometimes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));
    expect(screen.getByText(/Milestones · level 3 of 5/i)).toBeInTheDocument();
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

    setup(
      [
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
      "es",
    );

    expect(screen.getByText(/Última sesión: 19 may/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /mostrar sit/i }));
    expect(screen.getByText(/alcanzado 19 may/)).toBeInTheDocument();
    expect(screen.getByText(/19 de mayo de 2026 · 12 minutos/)).toBeInTheDocument();
    expect(screen.queryByText(/2026-05-19/)).not.toBeInTheDocument();
    expect(screen.queryByText(/May 18/)).not.toBeInTheDocument();
  });
});
