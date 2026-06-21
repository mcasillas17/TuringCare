import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/track", () => ({ track: (...a: unknown[]) => track(...a) }));

let mockSession: { user: { id: string } } | null = null;
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: mockSession, isPending: false }),
}));

import { TrainerDetail } from "./trainer-detail";

type TrainerStub = {
  id: string;
  name: string;
  businessName?: string | null;
  city: string;
  state: string;
  methodologyTags?: string[];
  certifications?: string[];
  specialties?: string[];
  website?: string | null;
  email?: string | null;
  phone?: string | null;
};

function stubTrainer(trainer: TrainerStub) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            trainer: {
              methodologyTags: [],
              certifications: [],
              specialties: [],
              ...trainer,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ),
  );
}

function renderDetail(id = "t1") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={[`/trainers/${id}`]}>
          <Routes>
            <Route path="/trainers/:id" element={<TrainerDetail />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockSession = null;
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("TrainerDetail", () => {
  it("emits trainer.viewed on mount", () => {
    stubTrainer({
      id: "tr1",
      name: "Jane Rivera",
      city: "Seattle",
      state: "WA",
    });
    renderDetail("tr1");
    expect(track).toHaveBeenCalledWith("trainer.viewed", { id: "tr1" });
  });

  it("renders the Send Brief cross-link when authed and the trainer has an email", async () => {
    mockSession = { user: { id: "u1" } };
    stubTrainer({
      id: "t1",
      name: "Sarah R+",
      city: "Austin",
      state: "TX",
      email: "sarah@example.com",
    });
    renderDetail("t1");
    const link = (await screen.findByRole("link", {
      name: /send my brief to this trainer/i,
    })) as HTMLAnchorElement;
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe(
      `/my/brief?recipient=${encodeURIComponent("sarah@example.com")}`,
    );
  });

  it("does NOT render the Send Brief cross-link when the trainer has no email", async () => {
    mockSession = { user: { id: "u1" } };
    stubTrainer({
      id: "t2",
      name: "Pat Trainer",
      city: "Denver",
      state: "CO",
      email: null,
    });
    renderDetail("t2");
    // Wait for the trainer name to land before asserting absence.
    await waitFor(() => expect(screen.getByText("Pat Trainer")).toBeInTheDocument());
    expect(
      screen.queryByRole("link", { name: /send my brief to this trainer/i }),
    ).not.toBeInTheDocument();
  });

  it("anonymous: shows the 'Sign up to contact' CTA and hides the brief-send button", async () => {
    mockSession = null;
    // API nulls contact for anon requests.
    stubTrainer({
      id: "t3",
      name: "Anon View",
      city: "Reno",
      state: "NV",
      email: null,
      phone: null,
    });
    renderDetail("t3");
    await waitFor(() => expect(screen.getByText("Anon View")).toBeInTheDocument());
    const cta = (await screen.findByRole("link", { name: /sign up/i })) as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/register");
    expect(
      screen.queryByRole("link", { name: /send my brief to this trainer/i }),
    ).not.toBeInTheDocument();
  });

  it("authed: hides the 'Sign up to contact' CTA and shows the brief-send button", async () => {
    mockSession = { user: { id: "u1" } };
    stubTrainer({
      id: "t4",
      name: "Authed View",
      city: "Austin",
      state: "TX",
      email: "authed@example.com",
    });
    renderDetail("t4");
    await waitFor(() => expect(screen.getByText("Authed View")).toBeInTheDocument());
    expect(
      screen.getByRole("link", { name: /send my brief to this trainer/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^sign up$/i })).toBeNull();
  });
});
