import { LocaleProvider } from "@/i18n";
import * as catalogLib from "@/lib/training-catalog";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CatalogTemplate } from "@turingcare/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TemplatePicker } from "./template-picker";

vi.mock("@/lib/training-catalog", () => ({
  useTrainingCatalog: vi.fn(),
  useApplyTemplate: vi.fn(),
}));

const sampleCatalog: CatalogTemplate[] = [
  {
    key: "basic-manners",
    name: "Basic Manners",
    description: "Foundational behaviors every dog should know",
    skills: [
      {
        key: "basic-manners.sit",
        name: "Sit",
        description: "Dog reliably sits on cue",
        levels: [
          { level: 1, description: "Lures into a sit with food in a quiet room" },
          { level: 2, description: "x" },
          { level: 3, description: "x" },
          { level: 4, description: "x" },
          { level: 5, description: "x" },
        ],
      },
      {
        key: "basic-manners.down",
        name: "Down",
        description: "Dog lies down on cue",
        levels: [
          { level: 1, description: "x" },
          { level: 2, description: "x" },
          { level: 3, description: "x" },
          { level: 4, description: "x" },
          { level: 5, description: "x" },
        ],
      },
    ],
  },
];

function setupMocks(opts: { mutateAsync?: ReturnType<typeof vi.fn> } = {}) {
  vi.mocked(catalogLib.useTrainingCatalog).mockReturnValue({
    data: sampleCatalog,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof catalogLib.useTrainingCatalog>);
  const mutateAsync = opts.mutateAsync ?? vi.fn().mockResolvedValue({});
  vi.mocked(catalogLib.useApplyTemplate).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof catalogLib.useApplyTemplate>);
  return { mutateAsync };
}

function renderPicker() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <TemplatePicker dogId="d1" />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  setupMocks();
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("TemplatePicker", () => {
  it("renders a Templates button; dropdown is closed by default", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: /Templates/i })).toBeInTheDocument();
    expect(screen.queryByText(/Basic Manners/)).not.toBeInTheDocument();
  });

  it("opens the dropdown with template names when clicked", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /Templates/i }));
    expect(screen.getByText("Basic Manners")).toBeInTheDocument();
  });

  it("clicking a template name opens the preview showing the included skills", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /Templates/i }));
    fireEvent.click(screen.getByText("Basic Manners"));
    expect(screen.getByText(/Will add these skills/i)).toBeInTheDocument();
    expect(screen.getByText("Sit")).toBeInTheDocument();
    expect(screen.getByText("Down")).toBeInTheDocument();
    expect(screen.getByText(/Dog reliably sits on cue/i)).toBeInTheDocument();
  });

  it("Cancel returns to the dropdown without applying", () => {
    const { mutateAsync } = setupMocks();
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /Templates/i }));
    fireEvent.click(screen.getByText("Basic Manners"));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText(/Will add these skills/i)).not.toBeInTheDocument();
  });

  it("Apply calls the mutation with the chosen template key", async () => {
    const { mutateAsync } = setupMocks();
    renderPicker();
    fireEvent.click(screen.getByRole("button", { name: /Templates/i }));
    fireEvent.click(screen.getByText("Basic Manners"));
    fireEvent.click(screen.getByRole("button", { name: /^Apply$/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith("basic-manners"));
  });
});
