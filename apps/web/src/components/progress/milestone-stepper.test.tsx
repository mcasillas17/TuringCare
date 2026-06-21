import { LocaleProvider } from "@/i18n";
import * as progressLib from "@/lib/progress";
import type { ProgressSkill } from "@/lib/progress";
import * as catalogLib from "@/lib/training-catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MilestoneStepper } from "./milestone-stepper";

vi.mock("@/lib/progress", async () => {
  const actual = await vi.importActual<typeof import("@/lib/progress")>("@/lib/progress");
  return { ...actual, useSetSkillLevel: vi.fn() };
});
vi.mock("@/lib/training-catalog", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/training-catalog")>("@/lib/training-catalog");
  return { ...actual, useTrainingCatalog: vi.fn() };
});

const skill: ProgressSkill = {
  id: "s1",
  name: "Sit",
  confidence: 2,
  position: 0,
  catalogSkillKey: null,
  sessionCount: 0,
  firstSessionAt: null,
  lastSessionAt: null,
  lastNote: null,
  sessions: [],
  milestones: [{ level: 2, reachedAt: new Date(2026, 5, 3).toISOString() }],
};

function setup(over: Partial<ProgressSkill> = {}) {
  const mutate = vi.fn();
  vi.mocked(progressLib.useSetSkillLevel).mockReturnValue({
    mutate,
    isPending: false,
  } as unknown as ReturnType<typeof progressLib.useSetSkillLevel>);
  vi.mocked(catalogLib.useTrainingCatalog).mockReturnValue({ data: [] } as unknown as ReturnType<
    typeof catalogLib.useTrainingCatalog
  >);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MilestoneStepper dogId="d1" skill={{ ...skill, ...over }} />
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { mutate };
}

describe("MilestoneStepper", () => {
  it("renders 5 generic levels for a free-form skill", () => {
    setup();
    expect(screen.getByText("Not yet")).toBeInTheDocument();
    expect(screen.getByText("Consistently")).toBeInTheDocument();
  });

  it("marks the next level when its CTA is tapped", () => {
    const { mutate } = setup({ confidence: 2 }); // next level is 3
    fireEvent.click(screen.getByRole("button", { name: /level 3/i }));
    expect(mutate).toHaveBeenCalledWith({ skillId: "s1", level: 3 });
  });
});
