import { LocaleProvider } from "@/i18n";
import * as progressLib from "@/lib/progress";
import * as focusLib from "@/lib/weekly-focus";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DogWeek } from "./dog-week";

vi.mock("@/lib/weekly-focus", async () => {
  const actual = await vi.importActual<typeof import("@/lib/weekly-focus")>("@/lib/weekly-focus");
  return {
    ...actual,
    useFocusWeek: vi.fn(),
    useAddFocus: vi.fn(),
    useRemoveFocus: vi.fn(),
  };
});
vi.mock("@/lib/progress", () => ({
  useProgress: vi.fn(),
  useLogSession: vi.fn(),
  useDeleteSession: vi.fn(),
}));

function setup(focusSkills: focusLib.FocusSkill[]) {
  vi.mocked(focusLib.useFocusWeek).mockReturnValue({
    data: focusSkills,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof focusLib.useFocusWeek>);
  vi.mocked(focusLib.useAddFocus).mockReturnValue({
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof focusLib.useAddFocus>);
  vi.mocked(focusLib.useRemoveFocus).mockReturnValue({
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof focusLib.useRemoveFocus>);
  vi.mocked(progressLib.useProgress).mockReturnValue({
    data: [],
  } as unknown as ReturnType<typeof progressLib.useProgress>);
  const logMutate = vi.fn().mockResolvedValue({});
  vi.mocked(progressLib.useLogSession).mockReturnValue({
    mutateAsync: logMutate,
  } as unknown as ReturnType<typeof progressLib.useLogSession>);
  vi.mocked(progressLib.useDeleteSession).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
  } as unknown as ReturnType<typeof progressLib.useDeleteSession>);
  return { logMutate };
}

function renderWeek(locale: "en" | "es" = "en") {
  localStorage.setItem("tc-locale", locale);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LocaleProvider>
        <MemoryRouter initialEntries={["/my/dogs/d1/week"]}>
          <Routes>
            <Route path="/my/dogs/:id/week" element={<DogWeek />} />
          </Routes>
        </MemoryRouter>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  localStorage.clear();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("DogWeek", () => {
  it("shows the pick-focus empty state when there are no focus skills", () => {
    setup([]);
    renderWeek();
    expect(screen.getByText(/Pick skills to focus on this week/i)).toBeInTheDocument();
  });

  it("renders a focus skill row and its goal", () => {
    setup([
      {
        skillId: "s1",
        name: "Recall",
        goalId: "g1",
        goalName: "Reliability",
        position: 0,
        sessions: [],
      },
    ]);
    renderWeek();
    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getByText("Reliability")).toBeInTheDocument();
  });

  it("logs a session when an empty cell is tapped", () => {
    const { logMutate } = setup([
      {
        skillId: "s1",
        name: "Recall",
        goalId: "g1",
        goalName: "Reliability",
        position: 0,
        sessions: [],
      },
    ]);
    renderWeek();
    const cell = screen.getAllByRole("button", { name: /Log Recall on/i })[0] as HTMLElement;
    fireEvent.click(cell);
    expect(logMutate).toHaveBeenCalledTimes(1);
  });

  it("localizes visual and screen-reader dates plus duration units in Spanish", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T18:00:00.000Z"));
    vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });
    setup([
      {
        skillId: "s1",
        name: "Recall",
        goalId: "g1",
        goalName: "Reliability",
        position: 0,
        sessions: [
          {
            id: "session-1",
            occurredAt: "2026-05-18T19:00:00.000Z",
            durationMinutes: 12,
          },
        ],
      },
    ]);

    renderWeek("es");

    expect(screen.getByRole("button", { name: "18 may – 24 may" })).toBeInTheDocument();
    const filledCell = screen.getByRole("button", {
      name: "Recall el lunes, 18 de mayo de 2026: 1 sesión",
    });
    fireEvent.click(filledCell);
    expect(screen.getByText(/12 minutos/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /2026-05-18/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/12m/)).not.toBeInTheDocument();
  });
});
