import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import * as journalLib from "@/lib/journal";
import type { JournalEntry } from "@/lib/journal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JournalView } from "./journal-view";

vi.mock("@/lib/dogs", () => ({ useDogs: vi.fn() }));
vi.mock("@/lib/journal", async () => {
  const actual = await vi.importActual<typeof import("@/lib/journal")>("@/lib/journal");
  return {
    ...actual,
    useJournal: vi.fn(),
    useAddEntry: vi.fn(),
    useDeleteEntry: vi.fn(),
    useUpdateEntry: vi.fn(),
  };
});

const entries: JournalEntry[] = [
  {
    id: "e1",
    dogId: "d1",
    kind: "moment",
    occurredAt: new Date(2026, 5, 21, 4, 46).toISOString(),
    note: "barked at bushes",
    trend: null,
    antecedent: null,
    behavior: null,
    consequence: null,
    intensity: null,
    location: null,
    notes: null,
    durationSeconds: null,
    recoverySeconds: null,
    peoplePresent: null,
    ownerResponse: null,
    dog: { id: "d1", name: "Turing" },
  },
];

function setup() {
  vi.mocked(dogsLib.useDogs).mockReturnValue({
    data: [{ id: "d1", name: "Turing" }],
  } as unknown as ReturnType<typeof dogsLib.useDogs>);
  vi.mocked(journalLib.useJournal).mockReturnValue({
    data: entries,
    isError: false,
  } as unknown as ReturnType<typeof journalLib.useJournal>);
  vi.mocked(journalLib.useAddEntry).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof journalLib.useAddEntry>);
  vi.mocked(journalLib.useDeleteEntry).mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<
    typeof journalLib.useDeleteEntry
  >);
  vi.mocked(journalLib.useUpdateEntry).mockReturnValue({
    isPending: false,
    data: undefined,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof journalLib.useUpdateEntry>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <JournalView scopedDogId="d1" />
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("JournalView", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 5, 21, 12, 0, 0) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows day-grouped entries with a Today label", () => {
    setup();
    expect(screen.getByText(/today/i)).toBeInTheDocument();
    expect(screen.getByText("barked at bushes")).toBeInTheDocument();
  });

  it("opens the Log a moment sheet from the tile", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /log moment/i }));
    expect(screen.getByRole("dialog", { name: /log/i })).toBeInTheDocument();
  });
});
