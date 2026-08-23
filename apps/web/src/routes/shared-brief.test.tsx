import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/components/brief-download-button", () => ({
  default: ({ brief }: { brief: { locale?: string } }) => (
    <div data-testid="download-locale">{brief.locale ?? "missing"}</div>
  ),
}));

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
}
beforeEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

const { SharedBrief } = await import("./shared-brief");

function setup() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/b/tok123"]}>
          <Routes>
            <Route path="/b/:token" element={<SharedBrief />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

it("renders the shared brief from the public endpoint", async () => {
  mockFetch(200, {
    brief: {
      dogName: "Rex",
      summary: "Behavior Brief — Rex\n...",
      status: "finalized",
      version: 2,
      generatedAt: "2026-05-22T00:00:00Z",
      locale: "en",
    },
  });
  setup();
  await waitFor(() => expect(screen.getByText(/Behavior Brief — Rex/)).toBeInTheDocument());
});

it("renders shared brief chrome and PDF handoff from stored Spanish locale under English UI", async () => {
  localStorage.setItem("tc-locale", "en");
  mockFetch(200, {
    brief: {
      dogName: "Rex",
      summary: "Resumen redactado por la familia",
      status: "finalized",
      version: 2,
      generatedAt: "2026-05-22T00:00:00Z",
      locale: "es",
    },
  });
  setup();

  const storedLocaleHeading = await screen.findByRole("heading", {
    name: "Resumen de conducta compartido",
  });
  expect(storedLocaleHeading).toHaveAttribute("lang", "es");
  expect(screen.getByText("Versión 2")).toBeInTheDocument();
  expect(screen.getByTestId("download-locale")).toHaveTextContent("es");
  expect(screen.getByText("Resumen redactado por la familia").closest("article")).toHaveAttribute(
    "lang",
    "es",
  );
  expect(screen.queryByRole("heading", { name: "Shared Behavior Brief" })).not.toBeInTheDocument();
  expect(screen.queryByText("Version 2")).not.toBeInTheDocument();
});

it("shows a not-available view on 404", async () => {
  mockFetch(404, { error: "not_found" });
  setup();
  await waitFor(() =>
    expect(screen.getByText(/isn't available|no está disponible/i)).toBeInTheDocument(),
  );
});
