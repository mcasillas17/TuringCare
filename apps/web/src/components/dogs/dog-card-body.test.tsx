import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import type { DogOverview } from "@/lib/dogs";
import * as journalLib from "@/lib/journal";
import * as progressLib from "@/lib/progress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DogCardBody } from "./dog-card-body";

vi.mock("@/lib/dogs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dogs")>("@/lib/dogs");
  return { ...actual, useDog: vi.fn(), useAddConcern: vi.fn(), useRemoveConcern: vi.fn() };
});
vi.mock("@/lib/progress", () => ({ useProgress: vi.fn() }));
vi.mock("@/lib/journal", () => ({ useJournal: vi.fn(), useAddEntry: vi.fn() }));

const overview: DogOverview = {
  id: "d1",
  name: "Turing",
  breed: "Mini Aussie",
  summary: {
    journalCount: 12,
    lastActivityAt: new Date().toISOString(),
    goalCount: 1,
    skillCount: 2,
    avgLevel: 3,
    briefStatus: "draft",
    briefVersion: 2,
  },
};

function setup() {
  vi.mocked(progressLib.useProgress).mockReturnValue({ data: [] } as unknown as ReturnType<
    typeof progressLib.useProgress
  >);
  vi.mocked(journalLib.useJournal).mockReturnValue({ data: [] } as unknown as ReturnType<
    typeof journalLib.useJournal
  >);
  vi.mocked(journalLib.useAddEntry).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof journalLib.useAddEntry>);
  const removeConcern = { mutate: vi.fn() };
  const addConcern = { mutateAsync: vi.fn().mockResolvedValue({}) };
  vi.mocked(dogsLib.useRemoveConcern).mockReturnValue(
    removeConcern as unknown as ReturnType<typeof dogsLib.useRemoveConcern>,
  );
  vi.mocked(dogsLib.useAddConcern).mockReturnValue(
    addConcern as unknown as ReturnType<typeof dogsLib.useAddConcern>,
  );
  vi.mocked(dogsLib.useDog).mockReturnValue({
    data: {
      dog: { id: "d1" },
      concerns: [{ id: "c1", concern: "Leash reactivity", severity: "moderate" }],
    },
  } as unknown as ReturnType<typeof dogsLib.useDog>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <DogCardBody dog={overview} />
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { removeConcern };
}

describe("DogCardBody", () => {
  it("opens the Log moment dialog in place (no navigation)", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /log moment/i }));
    expect(screen.getByRole("dialog", { name: /log moment/i })).toBeInTheDocument();
  });

  it("opens the Daily check-in dialog in place", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /daily check-in/i }));
    expect(screen.getByRole("dialog", { name: /daily check-in/i })).toBeInTheDocument();
  });

  it("lists concerns with a remove control and an add row", () => {
    const { removeConcern } = setup();
    expect(screen.getByText("Leash reactivity")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /remove leash reactivity/i }));
    expect(removeConcern.mutate).toHaveBeenCalledWith("c1");
    expect(screen.getByPlaceholderText(/concern/i)).toBeInTheDocument();
  });
});
