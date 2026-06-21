import { LocaleProvider } from "@/i18n";
import * as progressLib from "@/lib/progress";
import type { ProgressGoal } from "@/lib/progress";
import * as catalogLib from "@/lib/training-catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
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

function setup() {
  vi.mocked(progressLib.useProgress).mockReturnValue({
    data: goals,
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
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <ProgressPanel dogId="d1" />
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("ProgressPanel", () => {
  it("shows a level badge on the collapsed skill row and the stepper when expanded", () => {
    setup();
    expect(screen.getByText(/Level 3 — Sometimes/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /expand sit/i }));
    expect(screen.getByText(/Milestones · level 3 of 5/i)).toBeInTheDocument();
  });
});
