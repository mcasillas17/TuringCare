import { LocaleProvider } from "@/i18n";
import * as briefLib from "@/lib/brief";
import * as sendLib from "@/lib/brief-send";
import * as dogsLib from "@/lib/dogs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
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

type MockBrief = {
  status: string;
  version: number;
  summary: string;
  generatedAt: string;
  shareToken?: string | null;
};

function setup(brief: MockBrief | undefined, gen = vi.fn().mockResolvedValue({})) {
  vi.mocked(dogsLib.useDogs).mockReturnValue({
    data: [{ id: "d1", name: "Turing" }],
  } as unknown as ReturnType<typeof dogsLib.useDogs>);
  vi.mocked(briefLib.useBrief).mockReturnValue({
    data: brief,
    isError: false,
  } as unknown as ReturnType<typeof briefLib.useBrief>);
  vi.mocked(briefLib.useGenerateBrief).mockReturnValue({
    mutateAsync: gen,
    isPending: false,
  } as unknown as ReturnType<typeof briefLib.useGenerateBrief>);
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
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/my/dogs/d1/brief"]}>
          <Routes>
            <Route path="/my/dogs/:id/brief" element={<Brief />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { gen };
}

describe("Brief review", () => {
  it("renders the document preview with status and a Share action", () => {
    setup({
      status: "draft",
      version: 2,
      summary: "Turing summary text",
      generatedAt: new Date(2026, 5, 21).toISOString(),
      shareToken: null,
    });
    expect(screen.getByText("Turing summary text")).toBeInTheDocument();
    expect(screen.getByText(/draft · v2/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /share this brief/i })).toBeInTheDocument();
  });

  it("opens the share sheet", () => {
    setup({
      status: "finalized",
      version: 3,
      summary: "x",
      generatedAt: new Date(2026, 5, 21).toISOString(),
      shareToken: null,
    });
    fireEvent.click(screen.getByRole("button", { name: /share this brief/i }));
    expect(screen.getByRole("dialog", { name: /share/i })).toBeInTheDocument();
  });

  it("regenerates with the selected window when a period chip is clicked", async () => {
    const { gen } = setup({
      status: "draft",
      version: 1,
      summary: "x",
      generatedAt: new Date(2026, 5, 21).toISOString(),
      shareToken: null,
    });
    fireEvent.click(screen.getByRole("button", { name: /^7 days$/i }));
    await waitFor(() => expect(gen).toHaveBeenCalledWith("7d"));
  });
});
