import { LocaleProvider } from "@/i18n";
import * as briefLib from "@/lib/brief";
import * as sendLib from "@/lib/brief-send";
import * as dogsLib from "@/lib/dogs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Brief } from "./brief";

vi.mock("@/lib/dogs", () => ({ useDogs: vi.fn() }));
vi.mock("@/lib/brief-send", () => ({ useBriefSends: vi.fn(), useSendBrief: vi.fn() }));
vi.mock("@/lib/brief", () => ({
  useBrief: vi.fn(),
  useGenerateBrief: vi.fn(),
  useFinalizeBrief: vi.fn(),
  useShareBrief: vi.fn(),
  useRevokeShare: vi.fn(),
}));
vi.mock("@/components/brief-download-button", () => ({
  default: () => <button type="button">Download PDF</button>,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

type BriefData = {
  id: string;
  dogId: string;
  status: "draft" | "finalized";
  version: number;
  summary: string;
  generatedAt: string;
  shareToken: string | null;
};

const privateBrief: BriefData = {
  id: "brief-1",
  dogId: "d1",
  status: "draft",
  version: 2,
  summary: "Turing summary text",
  generatedAt: "2026-06-21T00:00:00.000Z",
  shareToken: null,
};

const sharedBrief: BriefData = {
  ...privateBrief,
  shareToken: "active-token",
};

function renderBrief() {
  return (
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/my/dogs/d1/brief"]}>
          <Routes>
            <Route path="/my/dogs/:id/brief" element={<Brief />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>
  );
}

function setup(
  brief: BriefData | undefined,
  gen = vi.fn().mockResolvedValue(privateBrief),
  initialPending = false,
) {
  let isPending = initialPending;
  vi.mocked(dogsLib.useDogs).mockReturnValue({
    data: [{ id: "d1", name: "Turing" }],
  } as unknown as ReturnType<typeof dogsLib.useDogs>);
  vi.mocked(briefLib.useBrief).mockReturnValue({
    data: brief,
    isError: false,
  } as unknown as ReturnType<typeof briefLib.useBrief>);
  vi.mocked(briefLib.useGenerateBrief).mockImplementation(
    () =>
      ({
        mutateAsync: gen,
        isPending,
      }) as unknown as ReturnType<typeof briefLib.useGenerateBrief>,
  );
  vi.mocked(briefLib.useFinalizeBrief).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof briefLib.useFinalizeBrief>);
  vi.mocked(briefLib.useShareBrief).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof briefLib.useShareBrief>);
  vi.mocked(briefLib.useRevokeShare).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof briefLib.useRevokeShare>);
  vi.mocked(sendLib.useBriefSends).mockReturnValue({ data: [] } as unknown as ReturnType<
    typeof sendLib.useBriefSends
  >);
  vi.mocked(sendLib.useSendBrief).mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof sendLib.useSendBrief>);

  const rendered = render(renderBrief());
  return {
    gen,
    setGenerationPending(nextPending: boolean) {
      isPending = nextPending;
      rendered.rerender(renderBrief());
    },
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("Brief review", () => {
  it("renders the document preview with status and a Share action", () => {
    setup(privateBrief);

    expect(screen.getByText("Turing summary text")).toBeInTheDocument();
    expect(screen.getByText(/draft · v2/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /share this brief/i })).toBeInTheDocument();
  });

  it("opens the share sheet", async () => {
    setup({ ...privateBrief, status: "finalized" });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /share this brief/i }));
      await vi.dynamicImportSettled();
    });

    expect(screen.getByRole("dialog", { name: /share/i })).toBeInTheDocument();
  });

  it("uses the selected window only when regenerating an existing Brief", () => {
    const { gen } = setup(privateBrief);

    fireEvent.click(screen.getByRole("button", { name: /^7 days$/i }));
    expect(gen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));
    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledWith("7d");
  });

  it("uses the selected window only when generating an empty Brief", () => {
    const { gen } = setup(undefined);

    fireEvent.click(screen.getByRole("button", { name: /^all time$/i }));
    expect(gen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^generate brief$/i }));
    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledWith("all");
  });

  it("regenerates a private Brief without confirmation", () => {
    const { gen } = setup(privateBrief);

    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));

    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledWith("30d");
    expect(
      screen.queryByRole("dialog", { name: /stop sharing this brief/i }),
    ).not.toBeInTheDocument();
  });

  it("asks before regenerating a shared Brief", () => {
    const { gen } = setup(sharedBrief);

    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));

    expect(screen.getByRole("dialog", { name: /stop sharing this brief/i })).toBeInTheDocument();
    expect(gen).not.toHaveBeenCalled();
  });

  it("cancels shared Brief regeneration without making a request", () => {
    const { gen } = setup(sharedBrief);

    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(
      screen.queryByRole("dialog", { name: /stop sharing this brief/i }),
    ).not.toBeInTheDocument();
    expect(gen).not.toHaveBeenCalled();
  });

  it("waits for successful shared Brief regeneration before closing confirmation", async () => {
    const pendingGeneration = deferred();
    const gen = vi.fn(() => pendingGeneration.promise);
    setup(sharedBrief, gen);

    fireEvent.click(screen.getByRole("button", { name: /^90 days$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));
    fireEvent.click(screen.getByRole("button", { name: /stop sharing and regenerate/i }));

    expect(gen).toHaveBeenCalledTimes(1);
    expect(gen).toHaveBeenCalledWith("90d");
    expect(screen.getByRole("dialog", { name: /stop sharing this brief/i })).toBeInTheDocument();

    await act(async () => {
      pendingGeneration.resolve();
      await pendingGeneration.promise;
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /stop sharing this brief/i }),
      ).not.toBeInTheDocument(),
    );
  });

  it("keeps shared Brief confirmation open after a failed regeneration", async () => {
    const gen = vi.fn().mockRejectedValue(new Error("generation failed"));
    setup(sharedBrief, gen);

    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));
    fireEvent.click(screen.getByRole("button", { name: /stop sharing and regenerate/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Generation failed"));
    expect(gen).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: /stop sharing this brief/i })).toBeInTheDocument();
  });

  it("disables generation actions while generation is pending", () => {
    const { setGenerationPending } = setup(sharedBrief);

    fireEvent.click(screen.getByRole("button", { name: /^regenerate$/i }));
    setGenerationPending(true);

    expect(screen.getByRole("button", { name: /^7 days$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^regenerate$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /stop sharing and regenerate/i })).toBeDisabled();
  });
});
