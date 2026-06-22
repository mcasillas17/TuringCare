import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import * as progressLib from "@/lib/progress";
import * as catalogLib from "@/lib/training-catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DogTraining } from "./dog-training";

vi.mock("@/lib/dogs", () => ({ useAddGoal: vi.fn() }));
vi.mock("@/lib/progress", () => ({
  useProgress: vi.fn(),
  useAddSkill: vi.fn(),
  useUpdateSkill: vi.fn(),
  useDeleteSkill: vi.fn(),
  useDeleteSession: vi.fn(),
  useSetSkillLevel: vi.fn(),
  LEVEL_KEYS: [],
}));
vi.mock("@/lib/training-catalog", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/training-catalog")>("@/lib/training-catalog");
  return { ...actual, useTrainingCatalog: vi.fn(), useApplyTemplate: vi.fn() };
});

function setup() {
  vi.mocked(dogsLib.useAddGoal).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof dogsLib.useAddGoal>);
  vi.mocked(progressLib.useProgress).mockReturnValue({
    data: [],
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
  vi.mocked(catalogLib.useApplyTemplate).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof catalogLib.useApplyTemplate>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/my/dogs/d1/training"]}>
          <Routes>
            <Route path="/my/dogs/:id/training" element={<DogTraining />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("DogTraining", () => {
  it("renders an Add goal + Templates toolbar instead of a duplicate goal list", () => {
    setup();
    expect(screen.getByRole("button", { name: /add goal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /templates/i })).toBeInTheDocument();
  });
});
