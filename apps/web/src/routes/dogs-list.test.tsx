import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import type { DogOverview } from "@/lib/dogs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DogsList } from "./dogs-list";

vi.mock("@/lib/dogs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dogs")>("@/lib/dogs");
  return { ...actual, useDogsOverview: vi.fn() };
});
vi.mock("@/components/dogs/dog-card", () => ({
  DogCard: ({ dog }: { dog: { name: string } }) => <div>card:{dog.name}</div>,
}));

const dogs: DogOverview[] = [
  {
    id: "d1",
    name: "Turing",
    breed: "Mini Aussie",
    summary: {
      journalCount: 0,
      lastActivityAt: null,
      goalCount: 0,
      skillCount: 0,
      avgLevel: null,
      briefStatus: null,
      briefVersion: null,
    },
  },
];

function setup(data: DogOverview[] | undefined) {
  vi.mocked(dogsLib.useDogsOverview).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof dogsLib.useDogsOverview>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <DogsList />
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("DogsList", () => {
  it("renders a card per dog", () => {
    setup(dogs);
    expect(screen.getByText("card:Turing")).toBeInTheDocument();
  });
  it("shows the empty state when there are no dogs", () => {
    setup([]);
    expect(screen.getByText(/No dogs yet/i)).toBeInTheDocument();
  });
});
