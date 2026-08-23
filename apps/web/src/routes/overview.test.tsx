import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Overview } from "./overview";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

function stub(
  over: unknown,
  dogs: unknown,
  guidedSetup: unknown = { active: null, latest: null, autoStartEligible: false },
  onboarding: unknown = {
    hasDog: false,
    momentsCount: 0,
    hasGoal: false,
    hasFinalizedBrief: false,
    hasSentBrief: false,
    mostRecentDogId: null,
  },
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
            : p.includes("/api/onboarding")
              ? onboarding
              : {};
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
    let guidedSetupRequests = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const p = new URL(url, "http://x").pathname;
        const body = p.includes("/api/overview")
          ? { dogCount: 1, journalEntryCount: 0, latestBrief: null, recentActivity: [] }
          : p.includes("/api/guided-setup")
            ? { error: "load_failed" }
            : p.includes("/api/onboarding")
              ? {
                  hasDog: true,
                  momentsCount: 0,
                  hasGoal: false,
                  hasFinalizedBrief: false,
                  hasSentBrief: false,
                  mostRecentDogId: "d1",
                }
              : { dogs: [] };
        if (p.includes("/api/guided-setup")) guidedSetupRequests += 1;
        return new Response(JSON.stringify(body), {
          status: p.includes("/api/guided-setup") ? 500 : 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    setup();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Guided setup is temporarily unavailable. You can still use your dashboard.",
      ),
    );
    expect(screen.getByRole("heading", { name: /Welcome back/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry guided setup" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Log 3 moments/i)).toBeInTheDocument());
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();

    const stableRequestCount = guidedSetupRequests;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(guidedSetupRequests).toBe(stableRequestCount);
  });

  it("hides the onboarding checklist while guided setup is active", async () => {
    stub(
      { dogCount: 1, journalEntryCount: 0, latestBrief: null, recentActivity: [] },
      [{ id: "d1", name: "Biscuit" }],
      {
        active: {
          id: "setup-1",
          dogId: "d1",
          dogName: "Biscuit",
          currentStep: "action",
          intent: "understand_behavior",
          startedAt: "2026-08-16T00:00:00Z",
          completedAt: null,
          completionReason: null,
          firstActionType: null,
          firstActionId: null,
        },
        latest: null,
        autoStartEligible: false,
      },
      {
        hasDog: true,
        momentsCount: 0,
        hasGoal: false,
        hasFinalizedBrief: false,
        hasSentBrief: false,
        mostRecentDogId: "d1",
      },
    );
    setup();

    await waitFor(() => expect(screen.getByText("guided setup destination")).toBeInTheDocument());
    expect(screen.queryByRole("heading", { name: /Get started/i })).not.toBeInTheDocument();
  });

  it("restores the completed checklist after guided setup has no active setup", async () => {
    stub(
      { dogCount: 1, journalEntryCount: 0, latestBrief: null, recentActivity: [] },
      [{ id: "d1", name: "Biscuit" }],
      {
        active: null,
        latest: {
          id: "setup-1",
          dogId: "d1",
          dogName: "Biscuit",
          currentStep: "action",
          intent: "understand_behavior",
          startedAt: "2026-08-16T00:00:00Z",
          completedAt: "2026-08-16T01:00:00Z",
          completionReason: "first_action_completed",
          firstActionType: "behavior",
          firstActionId: "concern-1",
        },
        autoStartEligible: false,
      },
      {
        hasDog: true,
        momentsCount: 7,
        hasGoal: true,
        hasFinalizedBrief: true,
        hasSentBrief: true,
        mostRecentDogId: "d1",
      },
    );
    setup();

    await waitFor(() => expect(screen.getByText(/all set up/i)).toBeInTheDocument());
  });
});
