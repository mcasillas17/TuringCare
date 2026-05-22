import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryCard } from "./entry-card";

const baseEntry = {
  id: "e1",
  occurredAt: "2026-05-19T10:00:00.000Z",
  antecedent: "Doorbell rang",
  behavior: "Lunged at door",
  consequence: "Treat redirect",
  intensity: 4,
  location: "Front door",
  notes: null,
  durationSeconds: 12,
  recoverySeconds: 45,
  peoplePresent: "Owner + walker",
  ownerResponse: "Asked for sit",
};

afterEach(() => vi.unstubAllGlobals());

function setup(entry = baseEntry) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <ul>
          <EntryCard entry={entry} dogId="d1" />
        </ul>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("EntryCard", () => {
  it("renders collapsed by default; clicking row expands and reveals all four new fields", async () => {
    setup();
    // Collapsed shows behavior line; does NOT show the new fields' labels.
    expect(screen.getByText(/Lunged at door/)).toBeInTheDocument();
    expect(screen.queryByText(/Duration \(seconds\)/)).not.toBeInTheDocument();

    // Click row to expand.
    fireEvent.click(screen.getByRole("button", { name: /Expand entry/i }));

    // Expanded shows all four new field labels + their values.
    expect(await screen.findByText(/Duration \(seconds\)/)).toBeInTheDocument();
    expect(screen.getByText(/Recovery \(seconds\)/)).toBeInTheDocument();
    expect(screen.getByText(/People present/)).toBeInTheDocument();
    expect(screen.getByText(/Your response/)).toBeInTheDocument();
    expect(screen.getByText(/Owner \+ walker/)).toBeInTheDocument();
    expect(screen.getByText(/Asked for sit/)).toBeInTheDocument();
  });

  it("clicking Edit enters editing mode with the form pre-populated", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Expand entry/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^✎ Edit$|^Edit$/i }));

    // Antecedent field pre-populated with the entry's value.
    const ant = (await screen.findByDisplayValue("Doorbell rang")) as HTMLInputElement;
    expect(ant).toBeInTheDocument();
    expect(screen.getByDisplayValue("Lunged at door")).toBeInTheDocument();
    // Numeric pre-population for the new fields.
    expect(screen.getByDisplayValue("12")).toBeInTheDocument();
    expect(screen.getByDisplayValue("45")).toBeInTheDocument();
    // Save Changes + Cancel buttons present.
    expect(screen.getByRole("button", { name: /Save changes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeInTheDocument();
  });

  it("save flow PUTs and returns to expanded with the new value", async () => {
    const calls: Array<{ url: string; method?: string; body?: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method, body: init?.body as string });
        if (init?.method === "PUT") {
          const updated = { ...baseEntry, behavior: "Recovered fast" };
          return new Response(JSON.stringify({ entry: updated }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Expand entry/i }));
    fireEvent.click(await screen.findByRole("button", { name: /^✎ Edit$|^Edit$/i }));

    const behaviorInput = (await screen.findByDisplayValue("Lunged at door")) as HTMLInputElement;
    fireEvent.change(behaviorInput, { target: { value: "Recovered fast" } });
    fireEvent.click(screen.getByRole("button", { name: /Save changes/i }));

    await waitFor(() =>
      expect(calls.some((c) => c.method === "PUT" && c.url.includes("/journal/e1"))).toBe(true),
    );
    // After save the card returns to expanded read-only with the new value rendered.
    await waitFor(() => expect(screen.getByText(/Recovered fast/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Save changes/i })).not.toBeInTheDocument();
  });
});
