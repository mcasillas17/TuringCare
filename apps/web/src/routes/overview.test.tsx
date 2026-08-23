import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Overview } from "./overview";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

function stub(over: unknown, dogs: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const p = new URL(url, "http://x").pathname;
      const body = p.includes("/api/overview") ? over : p.includes("/api/dogs") ? { dogs } : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

function setup(locale: "en" | "es" = "en") {
  localStorage.setItem("tc-locale", locale);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter>
          <Overview />
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

describe("Overview", () => {
  it("renders stats and recent activity (the dog list lives on /my/dogs)", async () => {
    stub(
      {
        dogCount: 1,
        journalEntryCount: 2,
        latestBrief: { status: "finalized" },
        recentActivity: [
          {
            dogName: "Biscuit",
            behavior: "Barked at delivery truck",
            occurredAt: "2026-05-19T10:00:00.000Z",
          },
        ],
      },
      [{ id: "d1", name: "Biscuit" }],
    );
    setup();
    await waitFor(() => expect(screen.getByText(/Barked at delivery truck/)).toBeInTheDocument());
    // The dashboard no longer duplicates a dog list; that's the dedicated Dogs page.
    expect(screen.queryByRole("heading", { name: "Your dogs" })).not.toBeInTheDocument();
  });

  it("shows onboarding checklist when dogCount is 0", async () => {
    stub({ dogCount: 0, journalEntryCount: 0, latestBrief: null, recentActivity: [] }, []);
    setup();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Get started/i })).toBeInTheDocument(),
    );
    const cta = screen.getByRole("link", { name: /Add your first dog/i });
    expect(cta).toHaveAttribute("href", "/my/dogs/new");
    // Stat cards should NOT render in the welcome state.
    expect(screen.queryByText(/Journal entries/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Latest Brief/i)).not.toBeInTheDocument();
  });

  it("shows no-entries nudge when dogs exist but entries==0", async () => {
    stub({ dogCount: 1, journalEntryCount: 0, latestBrief: null, recentActivity: [] }, [
      { id: "d1", name: "Biscuit" },
    ]);
    setup();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Ready to log your first entry/i }),
      ).toBeInTheDocument(),
    );
    const link = screen.getByRole("link", { name: /Open the journal/i });
    expect(link).toHaveAttribute("href", "/my/journal");
    // Stat cards DO render in this state.
    expect(screen.getByText(/Journal entries/i)).toBeInTheDocument();
  });

  it("shows no-brief nudge when entries exist but no finalized brief", async () => {
    stub(
      {
        dogCount: 1,
        journalEntryCount: 3,
        latestBrief: { status: "draft" },
        recentActivity: [
          { dogName: "Biscuit", behavior: "Sat calmly", occurredAt: "2026-05-19T10:00:00.000Z" },
        ],
      },
      [{ id: "d1", name: "Biscuit" }],
    );
    setup();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Generate your first Brief/i }),
      ).toBeInTheDocument(),
    );
    const link = screen.getByRole("link", { name: /Generate a Brief/i });
    expect(link).toHaveAttribute("href", "/my/brief");
  });

  it("shows no-brief nudge when entries exist and latestBrief is null", async () => {
    stub(
      {
        dogCount: 1,
        journalEntryCount: 3,
        latestBrief: null,
        recentActivity: [
          { dogName: "Biscuit", behavior: "Sat calmly", occurredAt: "2026-05-19T10:00:00.000Z" },
        ],
      },
      [{ id: "d1", name: "Biscuit" }],
    );
    setup();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: /Generate your first Brief/i }),
      ).toBeInTheDocument(),
    );
  });

  it("localizes known Brief status and activity dates from explicit Spanish, not browser English", async () => {
    vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });
    stub(
      {
        dogCount: 1,
        journalEntryCount: 1,
        latestBrief: { status: "finalized" },
        recentActivity: [
          {
            dogName: "Biscuit",
            behavior: "Esperó con calma",
            occurredAt: "2026-05-19T00:30:00.000Z",
          },
        ],
      },
      [{ id: "d1", name: "Biscuit" }],
    );

    setup("es");

    expect(await screen.findByText("Definitivo")).toBeInTheDocument();
    expect(screen.getByText(/19 de mayo de 2026/)).toBeInTheDocument();
    expect(screen.queryByText("finalized")).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-05-19/)).not.toBeInTheDocument();
    expect(screen.queryByText(/May 19/)).not.toBeInTheDocument();
  });
});
