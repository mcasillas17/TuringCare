import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BriefShareSheet } from "./share-sheet";

const { getBrief, generateBrief, finalizeBrief, shareBrief, revokeShare, celebrate } = vi.hoisted(
  () => ({
    getBrief: vi.fn(),
    generateBrief: vi.fn(),
    finalizeBrief: vi.fn(),
    shareBrief: vi.fn(),
    revokeShare: vi.fn(),
    celebrate: vi.fn(),
  }),
);

vi.mock("@/components/turing/turing-context", () => ({
  useTuring: () => ({ celebrate }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    api: {
      dogs: {
        ":id": {
          brief: {
            $get: getBrief,
            $post: generateBrief,
            $put: finalizeBrief,
            share: {
              $post: shareBrief,
              $delete: revokeShare,
            },
          },
        },
      },
    },
  },
}));

// @react-pdf/renderer only provides PDFDownloadLink in browser builds; the
// sheet tests exercise sharing and not PDF generation.
vi.mock("@/components/brief-download-button", () => ({
  default: () => <button type="button">Download PDF</button>,
}));

type Brief = {
  id: string;
  dogId: string;
  status: "draft" | "finalized";
  version: number;
  summary: string;
  generatedAt: string;
  shareToken: string | null;
};

const brief: Brief = {
  id: "brief-1",
  dogId: "d1",
  status: "finalized",
  version: 2,
  summary: "x",
  generatedAt: "2026-08-22T18:00:00.000Z",
  shareToken: null,
};

type BriefOverride = Partial<{
  id: string;
  dogId: string;
  status: "draft" | "finalized";
  version: number;
  summary: string;
  generatedAt: string;
  shareToken: string | null;
}>;

function ok<T>(body: T) {
  return { ok: true, json: async () => body };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function setup(over: BriefOverride = {}) {
  const queryClient = makeQueryClient();
  const sheet = (nextBrief: Brief) => (
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <BriefShareSheet
          open
          onClose={() => {}}
          dogId="d1"
          dogName="Turing"
          dog={undefined}
          brief={nextBrief}
        />
      </QueryClientProvider>
    </LocaleProvider>
  );
  const rendered = render(sheet({ ...brief, ...over }));
  return {
    ...rendered,
    rerenderBrief: (next: BriefOverride) => rendered.rerender(sheet({ ...brief, ...next })),
  };
}

afterEach(() => vi.clearAllMocks());

describe("BriefShareSheet", () => {
  it("lists the three share options with explanations", async () => {
    setup();
    expect(screen.getByRole("button", { name: /send to your trainer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy a private link/i })).toBeInTheDocument();
    await act(async () => {});
  });

  it("finalizes a draft when opening the email option", async () => {
    finalizeBrief.mockResolvedValue(ok({ brief: { ...brief, status: "finalized" as const } }));
    setup({ status: "draft" });
    fireEvent.click(screen.getByRole("button", { name: /send to your trainer/i }));
    expect(await screen.findByRole("heading", { name: /send to a trainer/i })).toBeInTheDocument();
  });

  it("shows the link after its parent rerenders with the complete shared Brief", async () => {
    shareBrief.mockResolvedValue(
      ok({ token: "tok123", url: "https://turingcare.example/b/tok123" }),
    );
    const { rerenderBrief } = setup({ shareToken: null });
    fireEvent.click(screen.getByRole("button", { name: /copy a private link/i }));
    await waitFor(() => expect(shareBrief).toHaveBeenCalledTimes(1));

    rerenderBrief({ shareToken: "tok123" });

    expect(await screen.findByDisplayValue(/\/b\/tok123$/)).toBeInTheDocument();
  });

  it("removes a locally created link when a newer private Brief replaces its prop", async () => {
    shareBrief.mockResolvedValue(
      ok({ token: "old-token", url: "https://turingcare.example/b/old-token" }),
    );
    const { rerenderBrief } = setup({ shareToken: null });
    fireEvent.click(screen.getByRole("button", { name: /copy a private link/i }));
    await waitFor(() => expect(shareBrief).toHaveBeenCalledTimes(1));
    rerenderBrief({ shareToken: "old-token" });
    expect(await screen.findByDisplayValue(/\/b\/old-token$/)).toBeInTheDocument();

    rerenderBrief({
      id: "brief-2",
      summary: "A newer private Brief.",
      version: 3,
      generatedAt: "2026-08-22T19:00:00.000Z",
      shareToken: null,
    });

    await waitFor(() =>
      expect(screen.queryByDisplayValue(/\/b\/old-token$/)).not.toBeInTheDocument(),
    );
    expect(screen.getByText(/generating/i)).toBeInTheDocument();
  });

  it("waits for revocation before returning to the sharing menu", async () => {
    let resolveRevoke!: (response: ReturnType<typeof ok<{ ok: true }>>) => void;
    revokeShare.mockReturnValue(
      new Promise((resolve) => {
        resolveRevoke = resolve;
      }),
    );
    setup({ shareToken: "tok123" });
    fireEvent.click(screen.getByRole("button", { name: /copy a private link/i }));
    expect(await screen.findByDisplayValue(/\/b\/tok123$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /stop sharing/i }));
    expect(screen.getByDisplayValue(/\/b\/tok123$/)).toBeInTheDocument();

    resolveRevoke(ok({ ok: true }));

    expect(await screen.findByRole("button", { name: /copy a private link/i })).toBeInTheDocument();
  });
});
