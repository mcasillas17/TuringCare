import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryCard } from "./entry-card";

const baseEntry = {
  id: "e1",
  dogId: "d1",
  kind: "moment",
  occurredAt: "2026-05-19T10:00:00.000Z",
  note: "Barked at delivery truck",
  trend: null,
  antecedent: "Truck stopped outside",
  behavior: "Barked twice",
  consequence: "Owner scattered kibble",
  intensity: 4,
  location: "Front door",
  notes: null,
  durationSeconds: 12,
  recoverySeconds: 45,
  peoplePresent: "Owner + walker",
  ownerResponse: "Asked for sit",
  dog: { id: "d1", name: "Biscuit" },
} as const;

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
  it("renders note and dog name first while collapsed", () => {
    setup();

    const card = screen.getByRole("listitem");
    expect(within(card).getByText("Barked at delivery truck")).toBeInTheDocument();
    expect(within(card).getByText(/Biscuit/)).toBeInTheDocument();
    expect(screen.queryByText("Truck stopped outside")).not.toBeInTheDocument();
  });

  it("expands to show optional ABC and context details", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: "Expand entry" }));

    expect(await screen.findByText("Truck stopped outside")).toBeInTheDocument();
    expect(screen.getByText("Barked twice")).toBeInTheDocument();
    expect(screen.getByText("Owner scattered kibble")).toBeInTheDocument();
    expect(screen.getByText("Front door")).toBeInTheDocument();
    expect(screen.getByText("Owner + walker")).toBeInTheDocument();
    expect(screen.getByText("Asked for sit")).toBeInTheDocument();
  });

  it("edits structured details and PUTs the update", async () => {
    const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ url, method: init?.method, body });
        if (init?.method === "PUT") {
          return new Response(JSON.stringify({ entry: { ...baseEntry, antecedent: "Doorbell rang" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("button", { name: "Expand entry" }));
    await user.click(await screen.findByRole("button", { name: "Edit details" }));
    const antecedent = (await screen.findByDisplayValue("Truck stopped outside")) as HTMLInputElement;
    await user.clear(antecedent);
    await user.type(antecedent, "Doorbell rang");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(
        calls.some(
          (call) =>
            call.method === "PUT" &&
            call.url.includes("/journal/e1") &&
            expect.objectContaining({ antecedent: "Doorbell rang" }).asymmetricMatch(call.body),
        ),
      ).toBe(true),
    );
  });
});
