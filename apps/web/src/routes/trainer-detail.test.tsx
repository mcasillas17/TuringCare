import { LocaleProvider } from "@/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
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
        <MemoryRouter initialEntries={[`/my/trainers/${id}`]}>
          <Routes>
            <Route path="/my/trainers/:id" element={<TrainerDetail />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("TrainerDetail", () => {
  it("renders the Send Brief cross-link when the trainer has an email", async () => {
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
});
