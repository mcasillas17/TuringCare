import { LocaleProvider } from "@/i18n";
import * as dogsLib from "@/lib/dogs";
import type { DogOverview } from "@/lib/dogs";
import * as journalLib from "@/lib/journal";
import * as progressLib from "@/lib/progress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DogCardBody } from "./dog-card-body";

vi.mock("@/lib/dogs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dogs")>("@/lib/dogs");
  return { ...actual, useDog: vi.fn() };
});
vi.mock("@/lib/progress", () => ({ useProgress: vi.fn() }));
vi.mock("@/lib/journal", () => ({ useJournal: vi.fn() }));

const overview: DogOverview = {
  id: "d1",
  name: "Turing",
  breed: "Mini Aussie",
  summary: {
    journalCount: 12,
    lastActivityAt: new Date().toISOString(),
    goalCount: 1,
    skillCount: 2,
    avgLevel: 3,
    briefStatus: "draft",
    briefVersion: 2,
  },
};

function setup() {
  vi.mocked(progressLib.useProgress).mockReturnValue({
    data: [
      {
        id: "g1",
        goal: "Basic Manners",
        catalogGoalKey: null,
        avgConfidence: 3,
        skills: [
          {
            id: "s1",
            name: "Sit",
            confidence: 3,
            position: 0,
            catalogSkillKey: null,
            sessionCount: 0,
            firstSessionAt: null,
            lastSessionAt: null,
            lastNote: null,
            sessions: [],
            milestones: [],
          },
        ],
      },
    ],
  } as unknown as ReturnType<typeof progressLib.useProgress>);
  vi.mocked(journalLib.useJournal).mockReturnValue({
    data: [
      {
        id: "e1",
        dogId: "d1",
        kind: "moment",
        occurredAt: new Date().toISOString(),
        note: "barked at bushes",
        trend: null,
        antecedent: null,
        behavior: null,
        consequence: null,
        intensity: null,
        location: null,
        notes: null,
        durationSeconds: null,
        recoverySeconds: null,
        peoplePresent: null,
        ownerResponse: null,
      },
    ],
  } as unknown as ReturnType<typeof journalLib.useJournal>);
  vi.mocked(dogsLib.useDog).mockReturnValue({
    data: {
      dog: { id: "d1" },
      concerns: [{ id: "c1", concern: "Leash reactivity", severity: "moderate" }],
    },
  } as unknown as ReturnType<typeof dogsLib.useDog>);
  render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <DogCardBody dog={overview} />
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("DogCardBody", () => {
  it("renders training goals with level badges, recent activity, and concerns", () => {
    setup();
    expect(screen.getByText("Basic Manners")).toBeInTheDocument();
    expect(screen.getByText(/Sit/)).toBeInTheDocument();
    expect(screen.getByText("barked at bushes")).toBeInTheDocument();
    expect(screen.getByText("Leash reactivity")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Training/i })).toHaveAttribute(
      "href",
      "/my/dogs/d1/training",
    );
  });
});
