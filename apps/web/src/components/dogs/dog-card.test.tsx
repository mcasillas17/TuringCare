import { LocaleProvider } from "@/i18n";
import type { DogOverview } from "@/lib/dogs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DogCard } from "./dog-card";

// Body is lazy + fetches; stub it so this test focuses on the header/toggle.
vi.mock("./dog-card-body", () => ({
  DogCardBody: ({ dog }: { dog: { name: string } }) => <div>body:{dog.name}</div>,
}));

const dog: DogOverview = {
  id: "d1",
  name: "Turing",
  breed: "Mini Aussie",
  summary: {
    journalCount: 12,
    lastActivityAt: null,
    goalCount: 1,
    skillCount: 5,
    avgLevel: 3,
    briefStatus: "draft",
    briefVersion: 2,
  },
};

function setup() {
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <DogCard dog={dog} />
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("DogCard", () => {
  it("shows name, breed, and a glance line; body hidden until expanded", () => {
    setup();
    expect(screen.getByText("Turing")).toBeInTheDocument();
    expect(screen.getByText(/Mini Aussie/)).toBeInTheDocument();
    expect(screen.getByText(/5 skills · avg 3\/5/)).toBeInTheDocument();
    expect(screen.queryByText("body:Turing")).not.toBeInTheDocument();
  });

  it("expands to mount the body when the header is clicked", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /Expand Turing/i }));
    expect(screen.getByText("body:Turing")).toBeInTheDocument();
  });
});
