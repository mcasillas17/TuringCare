import { LocaleProvider } from "@/i18n";
import * as briefLib from "@/lib/brief";
import { type BriefForPdf, type DogForPdf, buildBriefPdfModel } from "@/lib/brief-pdf-model";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Brief } from "./brief";

// The Download PDF control is lazy-loaded and pulls in @react-pdf/renderer,
// which resolves to its Node build under jsdom (PDFDownloadLink throws
// "web specific API"). Mock the lazy module so it renders a plain anchor;
// the real PDF document and pure model builder have their own unit tests.
vi.mock("@/components/brief-download-button", () => ({
  default: ({ brief, dog }: { brief: BriefForPdf; dog?: DogForPdf }) => {
    const model = buildBriefPdfModel({ brief, dog });
    return (
      <a href="blob:mock" download={model.fileName}>
        Download PDF
      </a>
    );
  },
}));

// Keep the real brief hooks for the fetch-driven tests below; individual
// share tests override the specific hooks they need via vi.mocked(...).
vi.mock("@/lib/brief", async (importOriginal) => {
  const actual = await importOriginal<typeof briefLib>();
  return {
    ...actual,
    useBrief: vi.fn(actual.useBrief),
    useGenerateBrief: vi.fn(actual.useGenerateBrief),
    useShareBrief: vi.fn(actual.useShareBrief),
    useRevokeShare: vi.fn(actual.useRevokeShare),
    useGenerateNarrative: vi.fn(actual.useGenerateNarrative),
  };
});

// vitest's mock factory captures the real implementations; restore them
// before every test so fetch-driven tests use the real hooks unless a test
// explicitly overrides them via stubBriefHook().
let realBrief: typeof briefLib;
beforeEach(async () => {
  realBrief = await vi.importActual<typeof briefLib>("@/lib/brief");
  vi.mocked(briefLib.useBrief).mockImplementation(realBrief.useBrief);
  vi.mocked(briefLib.useGenerateBrief).mockImplementation(realBrief.useGenerateBrief);
  vi.mocked(briefLib.useShareBrief).mockImplementation(realBrief.useShareBrief);
  vi.mocked(briefLib.useRevokeShare).mockImplementation(realBrief.useRevokeShare);
  vi.mocked(briefLib.useGenerateNarrative).mockImplementation(realBrief.useGenerateNarrative);
});

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const body = url.includes("/brief/sends")
        ? { sends: [] }
        : url.includes("/brief")
          ? {
              brief: {
                id: "b1",
                dogId: "d1",
                generatedAt: "2026-05-19T10:00:00.000Z",
                status: "draft",
                summary: "Behavior Brief — Biscuit\nConcerns: ...",
                version: 1,
              },
            }
          : {
              dogs: [
                {
                  id: "d1",
                  name: "Biscuit",
                  breed: "Border Collie",
                  dateOfBirth: "2022-05-19",
                  size: "medium",
                  sex: "female",
                },
              ],
            };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

type MockBrief = {
  id: string;
  dogId: string;
  generatedAt: string;
  status: string;
  summary: string;
  version: number;
  shareToken?: string | null;
  narrative?: string | null;
};

function renderBrief(dogId = "d1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={[`/my/dogs/${dogId}/brief`]}>
          <Routes>
            <Route path="/my/dogs/:id/brief" element={<Brief />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

function stubBriefHook(brief: MockBrief) {
  vi.mocked(briefLib.useBrief).mockReturnValue({
    data: brief,
    isError: false,
  } as unknown as ReturnType<typeof briefLib.useBrief>);
  const mutation = {
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  };
  vi.mocked(briefLib.useShareBrief).mockReturnValue(
    mutation as unknown as ReturnType<typeof briefLib.useShareBrief>,
  );
  vi.mocked(briefLib.useRevokeShare).mockReturnValue(
    mutation as unknown as ReturnType<typeof briefLib.useRevokeShare>,
  );
  vi.mocked(briefLib.useGenerateNarrative).mockReturnValue(
    mutation as unknown as ReturnType<typeof briefLib.useGenerateNarrative>,
  );
}

const baseBrief: MockBrief = {
  id: "b1",
  dogId: "d1",
  generatedAt: "2026-05-19T10:00:00.000Z",
  status: "draft",
  summary: "Behavior Brief — Biscuit\nConcerns: ...",
  version: 1,
};

describe("Brief", () => {
  it("renders the summary, version line, and a regenerate action for an existing brief", async () => {
    stubFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider>
          <MemoryRouter initialEntries={["/my/dogs/d1/brief"]}>
            <Routes>
              <Route path="/my/dogs/:id/brief" element={<Brief />} />
            </Routes>
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Behavior Brief — Biscuit/)).toBeInTheDocument());
    expect(screen.getByText(/Version 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate/i })).toBeInTheDocument();
  });

  it("renders a Download PDF control with a per-dog filename for an existing brief", async () => {
    stubFetch();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <LocaleProvider>
          <MemoryRouter initialEntries={["/my/dogs/d1/brief"]}>
            <Routes>
              <Route path="/my/dogs/:id/brief" element={<Brief />} />
            </Routes>
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    );
    const link = await screen.findByRole("link", { name: /Download PDF/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("download", "behavior-brief-biscuit.pdf");
  });

  it("shows a create-share-link control when the brief is not shared", async () => {
    stubFetch();
    stubBriefHook({ ...baseBrief });
    renderBrief();
    expect(await screen.findByRole("button", { name: /create share link/i })).toBeInTheDocument();
  });

  it("shows the share URL and a stop-sharing control when the brief is shared", async () => {
    stubFetch();
    stubBriefHook({ ...baseBrief, shareToken: "tok123" });
    renderBrief();
    const input = await screen.findByDisplayValue(/\/b\/tok123/);
    expect(input).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop sharing/i })).toBeInTheDocument();
  });

  it("passes the selected time window to the generate mutation", async () => {
    stubFetch();
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(briefLib.useGenerateBrief).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof briefLib.useGenerateBrief>);
    renderBrief();
    fireEvent.click(await screen.findByRole("button", { name: /^7 days$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Regenerate|Generate Brief/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("7d"));
  });
});

describe("Brief narrative control", () => {
  it("shows Generate when there's no narrative, and Regenerate + toggle once present", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({});
    vi.mocked(briefLib.useGenerateNarrative).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof briefLib.useGenerateNarrative>);

    vi.mocked(briefLib.useBrief).mockReturnValue({
      data: {
        id: "b1",
        summary: "Structured text",
        narrative: null,
        status: "draft",
        version: 1,
        generatedAt: "2026-05-22T00:00:00.000Z",
        shareToken: null,
      },
      isError: false,
    } as unknown as ReturnType<typeof briefLib.useBrief>);
    const { unmount } = renderBrief("d1");
    expect(await screen.findByText("✨ Generate readable version")).toBeInTheDocument();
    expect(screen.getByText("Structured text")).toBeInTheDocument();
    expect(
      screen.getByText("Generates a readable version using AI from your logged data."),
    ).toBeInTheDocument();
    unmount();

    vi.mocked(briefLib.useBrief).mockReturnValue({
      data: {
        id: "b1",
        summary: "Structured text",
        narrative: "Warm prose here.",
        status: "draft",
        version: 1,
        generatedAt: "2026-05-22T00:00:00.000Z",
        shareToken: null,
      },
      isError: false,
    } as unknown as ReturnType<typeof briefLib.useBrief>);
    renderBrief("d1");
    expect(await screen.findByText("Warm prose here.")).toBeInTheDocument();
    expect(screen.getByText("↻ Regenerate")).toBeInTheDocument();
    expect(screen.getByText("Show structured")).toBeInTheDocument();
    expect(
      screen.queryByText("Generates a readable version using AI from your logged data."),
    ).not.toBeInTheDocument();
  });
});
