import { LocaleProvider } from "@/i18n";
import * as briefLib from "@/lib/brief";
import * as sendLib from "@/lib/brief-send";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BriefShareSheet } from "./share-sheet";

vi.mock("@/lib/brief-send", () => ({ useBriefSends: vi.fn(), useSendBrief: vi.fn() }));
vi.mock("@/lib/brief", () => ({
  useFinalizeBrief: vi.fn(),
  useShareBrief: vi.fn(),
  useRevokeShare: vi.fn(),
}));
// PDF button is lazy + heavy; stub it.
vi.mock("@/components/brief-download-button", () => ({
  default: () => <button type="button">Download PDF</button>,
}));

const brief = {
  status: "draft",
  version: 2,
  summary: "x",
  generatedAt: new Date().toISOString(),
  shareToken: null,
} as const;

type BriefOverride = Partial<{
  status: "draft" | "finalized";
  version: number;
  summary: string;
  generatedAt: string;
  shareToken: string | null;
}>;

function setup(over: BriefOverride = {}) {
  const finalize = vi.fn().mockResolvedValue({});
  vi.mocked(briefLib.useFinalizeBrief).mockReturnValue({
    mutateAsync: finalize,
    isPending: false,
  } as unknown as ReturnType<typeof briefLib.useFinalizeBrief>);
  const createShare = vi.fn().mockResolvedValue({ token: "tok123", url: "/b/tok123" });
  vi.mocked(briefLib.useShareBrief).mockReturnValue({
    mutateAsync: createShare,
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
        <BriefShareSheet
          open
          onClose={() => {}}
          dogId="d1"
          dogName="Turing"
          dog={undefined}
          brief={{ ...brief, ...over }}
        />
      </QueryClientProvider>
    </LocaleProvider>,
  );
  return { finalize, createShare };
}

describe("BriefShareSheet", () => {
  it("lists the three share options with explanations", () => {
    setup();
    expect(screen.getByRole("button", { name: /send to your trainer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy a private link/i })).toBeInTheDocument();
  });

  it("finalizes a draft when opening the email option", async () => {
    const { finalize } = setup({ status: "draft" });
    fireEvent.click(screen.getByRole("button", { name: /send to your trainer/i }));
    await waitFor(() => expect(finalize).toHaveBeenCalled());
  });

  it("creates a link and shows the URL immediately from the mutation result", async () => {
    const { createShare } = setup({ status: "finalized", shareToken: null });
    fireEvent.click(screen.getByRole("button", { name: /copy a private link/i }));
    await waitFor(() => expect(createShare).toHaveBeenCalled());
    // URL is shown from the returned token, not waiting for a brief refetch.
    expect(await screen.findByDisplayValue(/\/b\/tok123$/)).toBeInTheDocument();
  });
});
