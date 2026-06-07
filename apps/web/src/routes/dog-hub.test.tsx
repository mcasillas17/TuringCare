import { LocaleProvider } from "@/i18n";
import * as briefLib from "@/lib/brief";
import * as dogsLib from "@/lib/dogs";
import * as journalLib from "@/lib/journal";
import * as progressLib from "@/lib/progress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DogHub } from "./dog-hub";

vi.mock("@/lib/dogs", () => ({
  useDog: vi.fn(),
  useAddConcern: vi.fn(),
  useRemoveConcern: vi.fn(),
}));
vi.mock("@/lib/journal", () => ({ useJournal: vi.fn() }));
vi.mock("@/lib/brief", () => ({ useBrief: vi.fn() }));
vi.mock("@/lib/progress", () => ({ useProgress: vi.fn() }));

function setupAll(
  overrides: {
    concerns?: { id: string; concern: string; severity: string }[];
    entries?: { id: string; note: string; occurredAt: string }[];
    goals?: { skills: { confidence: number }[] }[];
    brief?: { status: string; version: number; generatedAt: string } | null;
  } = {},
) {
  vi.mocked(dogsLib.useDog).mockReturnValue({
    data: {
      dog: { id: "d1", name: "Biscuit" },
      concerns: overrides.concerns ?? [],
      goals: [],
    },
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof dogsLib.useDog>);
  vi.mocked(dogsLib.useAddConcern).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  } as unknown as ReturnType<typeof dogsLib.useAddConcern>);
  vi.mocked(dogsLib.useRemoveConcern).mockReturnValue({
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof dogsLib.useRemoveConcern>);
  vi.mocked(journalLib.useJournal).mockReturnValue({
    data: overrides.entries ?? [],
    isError: false,
  } as unknown as ReturnType<typeof journalLib.useJournal>);
  vi.mocked(briefLib.useBrief).mockReturnValue({
    data: overrides.brief ?? null,
    isError: false,
  } as unknown as ReturnType<typeof briefLib.useBrief>);
  vi.mocked(progressLib.useProgress).mockReturnValue({
    data: overrides.goals ?? [],
  } as unknown as ReturnType<typeof progressLib.useProgress>);
}

function renderHub() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/my/dogs/d1"]}>
          <Routes>
            <Route path="/my/dogs/:id" element={<DogHub />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => setupAll());

afterEach(() => vi.resetAllMocks());

describe("DogHub", () => {
  it("renders three spoke cards linking to the spokes", () => {
    renderHub();
    // Anchor on the start of the card's accessible name to disambiguate from the
    // RecentActivity "See all in Journal →" link.
    expect(screen.getByRole("link", { name: /^Journal/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/journal",
    );
    expect(screen.getByRole("link", { name: /^Training/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/training",
    );
    expect(screen.getByRole("link", { name: /^Brief/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/brief",
    );
  });

  it("shows empty-state metric strings when there's no data", () => {
    renderHub();
    expect(screen.getByText(/No entries yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No goals yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No brief yet/i)).toBeInTheDocument();
  });

  it("renders the journal entry count when entries exist", () => {
    setupAll({
      entries: [
        {
          id: "e1",
          note: "Pulled at the gate",
          occurredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        } as never,
      ],
    });
    renderHub();
    expect(screen.getByText(/1 entries/i)).toBeInTheDocument();
  });

  it("renders the Log a moment CTA linking to the journal spoke with ?compose=moment", () => {
    renderHub();
    expect(screen.getByRole("link", { name: /\+ Log a moment/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/journal?compose=moment",
    );
  });
});
