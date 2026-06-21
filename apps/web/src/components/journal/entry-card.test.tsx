import { LocaleProvider } from "@/i18n";
import * as journalLib from "@/lib/journal";
import type { JournalEntry } from "@/lib/journal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntryCard } from "./entry-card";

vi.mock("@/lib/journal", async () => {
  const actual = await vi.importActual<typeof import("@/lib/journal")>("@/lib/journal");
  return { ...actual, useDeleteEntry: vi.fn(), useUpdateEntry: vi.fn() };
});

const base: JournalEntry = {
  id: "e1",
  dogId: "d1",
  kind: "moment",
  occurredAt: new Date(2026, 5, 21, 4, 46).toISOString(),
  note: "barked at bushes",
  trend: null,
  antecedent: null,
  behavior: null,
  consequence: null,
  intensity: 2,
  location: null,
  notes: null,
  durationSeconds: null,
  recoverySeconds: null,
  peoplePresent: null,
  ownerResponse: null,
  dog: { id: "d1", name: "Turing" },
};

function renderCard(entry: JournalEntry) {
  const del = { mutate: vi.fn() };
  vi.mocked(journalLib.useDeleteEntry).mockReturnValue(
    del as unknown as ReturnType<typeof journalLib.useDeleteEntry>,
  );
  vi.mocked(journalLib.useUpdateEntry).mockReturnValue({
    isPending: false,
    data: undefined,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof journalLib.useUpdateEntry>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <ul>
          <EntryCard entry={entry} dogId="d1" />
        </ul>
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { del };
}

describe("EntryCard", () => {
  it("renders note, humanized time, and intensity badge; hides Remove until opened", () => {
    const { del } = renderCard(base);
    expect(screen.getByText("barked at bushes")).toBeInTheDocument();
    expect(screen.getByText(/4:46/)).toBeInTheDocument();
    expect(screen.getByText(/intensity.*2/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument();
    expect(del.mutate).not.toHaveBeenCalled();
  });

  it("opens the entry and exposes Remove", () => {
    renderCard(base);
    fireEvent.click(screen.getByRole("button", { name: /open entry/i }));
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument();
  });
});
