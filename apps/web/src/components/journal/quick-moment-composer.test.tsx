import { LocaleProvider } from "@/i18n";
import * as journalLib from "@/lib/journal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickMomentComposer } from "./quick-moment-composer";

vi.mock("@/lib/journal", () => ({ useAddEntry: vi.fn() }));

function setup() {
  const mutateAsync = vi.fn().mockResolvedValue({ id: "e1", kind: "moment" });
  vi.mocked(journalLib.useAddEntry).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof journalLib.useAddEntry>);
  const onSaved = vi.fn();
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <QuickMomentComposer
          dogs={[{ id: "d1", name: "Turing" }]}
          selectedDogId="d1"
          onDogChange={() => {}}
          onSaved={onSaved}
        />
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { mutateAsync, onSaved };
}

describe("QuickMomentComposer", () => {
  it("saves a moment with one-tap intensity", async () => {
    const { mutateAsync } = setup();
    fireEvent.change(screen.getByLabelText(/quick note/i), {
      target: { value: "barked at bushes" },
    });
    fireEvent.click(screen.getByRole("button", { name: /intensity 3/i }));
    fireEvent.click(screen.getByRole("button", { name: /save moment/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "moment", note: "barked at bushes", intensity: 3 }),
    );
  });

  it("reveals ABC fields under Add detail and sends them", async () => {
    const { mutateAsync } = setup();
    fireEvent.change(screen.getByLabelText(/quick note/i), { target: { value: "lunged" } });
    fireEvent.click(screen.getByRole("button", { name: /add detail/i }));
    fireEvent.change(screen.getByLabelText(/antecedent/i), { target: { value: "doorbell rang" } });
    fireEvent.click(screen.getByRole("button", { name: /save moment/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ antecedent: "doorbell rang" }),
    );
  });
});
