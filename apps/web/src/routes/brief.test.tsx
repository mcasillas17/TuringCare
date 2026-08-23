import { LocaleProvider } from "@/i18n";
import * as briefLib from "@/lib/brief";
import { BriefRequestError } from "@/lib/brief-errors";
import * as sendLib from "@/lib/brief-send";
import * as dogsLib from "@/lib/dogs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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
  default: ({ brief }: { brief: { locale?: string } }) => (
    <button type="button" data-testid="owned-download-locale">
      {brief.locale ?? "missing"} Download PDF
    </button>
  ),
}));

type MockBrief = {
  status: "draft" | "finalized";
  version: number;
  summary: string;
  generatedAt: string;
  locale?: "en" | "es";
  shareToken?: string | null;
};

afterEach(() => {
  localStorage.clear();
});

function setup(brief: MockBrief | undefined, gen = vi.fn().mockResolvedValue({}), uiLocale = "en") {
  localStorage.setItem("tc-locale", uiLocale);
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

function setupLoadError(error: unknown, uiLocale: "en" | "es") {
  localStorage.setItem("tc-locale", uiLocale);
  vi.mocked(dogsLib.useDogs).mockReturnValue({
    data: [{ id: "d1", name: "Turing" }],
  } as unknown as ReturnType<typeof dogsLib.useDogs>);
  vi.mocked(briefLib.useBrief).mockReturnValue({
    data: undefined,
    error,
    isError: true,
  } as unknown as ReturnType<typeof briefLib.useBrief>);
  vi.mocked(briefLib.useGenerateBrief).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  } as unknown as ReturnType<typeof briefLib.useGenerateBrief>);

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
}

describe("Brief review", () => {
  it.each([
    ["en", "There is more than one latest Brief version. Generate a new version."],
    ["es", "Hay más de una versión reciente del resumen. Genera una nueva versión."],
  ] as const)("renders localized recovery for a %s load conflict", (locale, expected) => {
    setupLoadError(new BriefRequestError("brief_version_conflict", 409, "load"), locale);

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("keeps a wrong-context load failure on generic recovery copy", () => {
    setupLoadError(new BriefRequestError("brief_version_conflict", 409, "share"), "en");

    expect(screen.getByText("Couldn't load the Brief.")).toBeInTheDocument();
    expect(screen.queryByText(/more than one latest Brief version/i)).not.toBeInTheDocument();
  });

  it("renders the document preview with status and a Share action", () => {
    setup({
      status: "draft",
      version: 2,
      summary: "Turing summary text",
      generatedAt: new Date(2026, 5, 21).toISOString(),
      locale: "en",
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
      locale: "en",
      shareToken: null,
    });
    fireEvent.click(screen.getByRole("button", { name: /share this brief/i }));
    expect(screen.getByRole("dialog", { name: /share/i })).toBeInTheDocument();
  });

  it("passes the stored locale into the owned PDF download handoff", async () => {
    setup({
      status: "finalized",
      version: 3,
      summary: "Resumen para PDF",
      generatedAt: "2026-05-22T12:00:00Z",
      locale: "es",
      shareToken: null,
    });

    fireEvent.click(screen.getByRole("button", { name: /share this brief/i }));

    expect(await screen.findByTestId("owned-download-locale")).toHaveTextContent("es Download PDF");
  });

  it("regenerates with the selected window when a period chip is clicked", async () => {
    const { gen } = setup({
      status: "draft",
      version: 1,
      summary: "x",
      generatedAt: new Date(2026, 5, 21).toISOString(),
      locale: "en",
      shareToken: null,
    });
    fireEvent.click(screen.getByRole("button", { name: /^7 days$/i }));
    await waitFor(() => expect(gen).toHaveBeenCalledWith("7d"));
  });

  it("renders owned brief chrome from the stored Spanish locale even when the UI is English", () => {
    setup(
      {
        status: "finalized",
        version: 3,
        summary: "Resumen escrito por el usuario",
        generatedAt: "2026-05-22T12:00:00Z",
        locale: "es",
        shareToken: null,
      },
      undefined,
      "en",
    );

    expect(screen.getByText("Resumen de conducta")).toBeInTheDocument();
    expect(screen.getByText("Definitivo · v3")).toBeInTheDocument();
    expect(screen.getByText("Generado 22 de mayo de 2026")).toBeInTheDocument();
    expect(screen.queryByText("Behavior Brief")).not.toBeInTheDocument();
    expect(screen.queryByText("Final · v3")).not.toBeInTheDocument();
    expect(screen.queryByText("Generated May 22, 2026")).not.toBeInTheDocument();
    expect(screen.getByText("Resumen escrito por el usuario").closest("article")).toHaveAttribute(
      "lang",
      "es",
    );
  });

  it("keeps owned brief chrome English from the stored locale even when the UI is Spanish", () => {
    setup(
      {
        status: "draft",
        version: 2,
        summary: "English stored brief",
        generatedAt: "2026-05-22T12:00:00Z",
        locale: "en",
        shareToken: null,
      },
      undefined,
      "es",
    );

    expect(screen.getByText("Behavior Brief")).toBeInTheDocument();
    expect(screen.getByText("Draft · v2")).toBeInTheDocument();
    expect(screen.getByText("Generated May 22, 2026")).toBeInTheDocument();
    expect(screen.queryByText("Resumen de conducta")).not.toBeInTheDocument();
    expect(screen.queryByText("Borrador · v2")).not.toBeInTheDocument();
    expect(screen.queryByText("Generado 22 de mayo de 2026")).not.toBeInTheDocument();
    expect(screen.getByText("English stored brief").closest("article")).toHaveAttribute(
      "lang",
      "en",
    );
  });
});
