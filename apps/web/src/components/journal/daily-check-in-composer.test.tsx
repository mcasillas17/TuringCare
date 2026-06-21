import { LocaleProvider } from "@/i18n";
import * as journalLib from "@/lib/journal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DailyCheckInComposer } from "./daily-check-in-composer";

vi.mock("@/lib/journal", () => ({ useAddEntry: vi.fn() }));

function setup() {
  const mutateAsync = vi.fn().mockResolvedValue({ id: "c1", kind: "daily_checkin" });
  vi.mocked(journalLib.useAddEntry).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof journalLib.useAddEntry>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <DailyCheckInComposer
          dogs={[{ id: "d1", name: "Turing" }]}
          selectedDogId="d1"
          onDogChange={() => {}}
          onSaved={() => {}}
        />
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { mutateAsync };
}

describe("DailyCheckInComposer", () => {
  it("saves a check-in with the chosen trend", async () => {
    const { mutateAsync } = setup();
    fireEvent.click(screen.getByRole("button", { name: /better/i }));
    fireEvent.change(screen.getByPlaceholderText(/a line about today/i), {
      target: { value: "calmer walk" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save check-in/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "daily_checkin", trend: "better", note: "calmer walk" }),
    );
  });
});
