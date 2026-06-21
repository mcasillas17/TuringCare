import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

// Mock the typed hc<AppType> client. Each call returns an ok Response-like
// object with a json() resolving to the relevant payload.
const listTrainers = vi.fn();
const createTrainer = vi.fn();
const updateTrainer = vi.fn();
const deleteTrainer = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    api: {
      trainers: {
        $get: (...args: unknown[]) => listTrainers(...args),
      },
      admin: {
        trainers: {
          $post: (...args: unknown[]) => createTrainer(...args),
          ":id": {
            $put: (...args: unknown[]) => updateTrainer(...args),
            $delete: (...args: unknown[]) => deleteTrainer(...args),
          },
        },
      },
    },
  },
}));

import { AdminTrainers } from "./trainers";

afterEach(() => {
  vi.clearAllMocks();
});

function setup() {
  listTrainers.mockResolvedValue({ ok: true, json: async () => ({ trainers: [] }) });
  createTrainer.mockResolvedValue({
    ok: true,
    json: async () => ({ trainer: { id: "t1", name: "New Trainer" } }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminTrainers />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it("renders the trainer form fields", async () => {
  setup();
  expect(await screen.findByLabelText(/^name$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^city$/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/^state$/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /add trainer/i })).toBeInTheDocument();
});

it("submitting the form calls the create endpoint", async () => {
  const user = userEvent.setup();
  setup();
  await screen.findByLabelText(/^name$/i);

  await user.type(screen.getByLabelText(/^name$/i), "New Trainer");
  await user.type(screen.getByLabelText(/^city$/i), "Austin");
  await user.type(screen.getByLabelText(/^state$/i), "TX");
  await user.click(screen.getByRole("button", { name: /add trainer/i }));

  await waitFor(() => expect(createTrainer).toHaveBeenCalledTimes(1));
  const call = createTrainer.mock.calls[0]?.[0] as { json: { name: string } };
  expect(call.json.name).toBe("New Trainer");
});

it("renders trainers as a table", async () => {
  listTrainers.mockResolvedValue({
    ok: true,
    json: async () => ({
      trainers: [
        {
          id: "t1",
          name: "Jane Rivera",
          businessName: "Pawsitive K9",
          city: "Seattle",
          state: "WA",
          methodologyTags: [],
          certifications: [],
          specialties: [],
          website: null,
          email: null,
          phone: null,
        },
      ],
    }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AdminTrainers />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByRole("table")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: /organization/i })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Jane Rivera" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Pawsitive K9" })).toBeInTheDocument();
});
