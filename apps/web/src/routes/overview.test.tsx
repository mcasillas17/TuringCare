import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Overview } from "./overview";

afterEach(() => vi.unstubAllGlobals());

function stub(
  over: unknown,
  dogs: unknown,
  guidedSetup: unknown = { active: null, latest: null, autoStartEligible: false },
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const p = new URL(url, "http://x").pathname;
      const body = p.includes("/api/overview")
        ? over
        : p.includes("/api/dogs")
          ? { dogs }
          : p.includes("/api/guided-setup")
            ? guidedSetup
            : {};
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter>
          <Routes>
            <Route path="*" element={<Overview />} />
            <Route path="/my/setup" element={<p>guided setup destination</p>} />
          </Routes>
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

  it("redirects an eligible owner to guided setup", async () => {
    stub({ dogCount: 0, journalEntryCount: 0, latestBrief: null, recentActivity: [] }, [], {
      active: null,
      latest: null,
      autoStartEligible: true,
    });
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <LocaleProvider>
          <MemoryRouter initialEntries={["/my"]}>
            <Routes>
              <Route path="/my" element={<Overview />} />
              <Route path="/my/setup" element={<p>guided setup destination</p>} />
            </Routes>
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText("guided setup destination")).toBeInTheDocument());
  });

  it("redirects an owner with an active setup", async () => {
    stub(
      { dogCount: 1, journalEntryCount: 0, latestBrief: null, recentActivity: [] },
      [{ id: "d1", name: "Biscuit" }],
      {
        active: {
          id: "00000000-0000-4000-8000-000000000001",
          dogId: "d1",
          dogName: "Biscuit",
          currentStep: "intent",
          intent: null,
          startedAt: "2026-08-16T00:00:00.000Z",
          completedAt: null,
          completionReason: null,
          firstActionType: null,
          firstActionId: null,
        },
        latest: null,
        autoStartEligible: false,
      },
    );
    setup();

    await waitFor(() => expect(screen.getByText("guided setup destination")).toBeInTheDocument());
  });

  it("redirects an eligible owner before showing an overview error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const p = new URL(url, "http://x").pathname;
        const guided = p.includes("/api/guided-setup");
        return new Response(
          JSON.stringify(
            guided
              ? { active: null, latest: null, autoStartEligible: true }
              : { error: "load_failed" },
          ),
          {
            status: guided ? 200 : 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }),
    );
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <LocaleProvider>
          <MemoryRouter initialEntries={["/my"]}>
            <Routes>
              <Route path="/my" element={<Overview />} />
              <Route path="/my/setup" element={<p>guided setup destination</p>} />
            </Routes>
          </MemoryRouter>
        </LocaleProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByText("guided setup destination")).toBeInTheDocument());
    expect(screen.queryByText("Couldn't load your dogs.")).not.toBeInTheDocument();
  });

  it("keeps the dashboard available with a localized guided setup warning", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const p = new URL(url, "http://x").pathname;
        const body = p.includes("/api/overview")
          ? { dogCount: 1, journalEntryCount: 0, latestBrief: null, recentActivity: [] }
          : p.includes("/api/guided-setup")
            ? { error: "load_failed" }
            : { dogs: [] };
        return new Response(JSON.stringify(body), {
          status: p.includes("/api/guided-setup") ? 500 : 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    setup();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /Welcome back/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Guided setup is temporarily unavailable. You can still use your dashboard.",
    );
    expect(screen.getByRole("button", { name: "Retry guided setup" })).toBeInTheDocument();
  });
});
