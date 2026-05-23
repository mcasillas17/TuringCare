import { LocaleProvider } from "@/i18n";
import { type BriefForPdf, type DogForPdf, buildBriefPdfModel } from "@/lib/brief-pdf-model";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
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
});
