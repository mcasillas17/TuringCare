import { en } from "@/i18n/en";
import { es } from "@/i18n/es";
import { LocaleProvider } from "@/i18n/index";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TuringCompanion } from "./turing-companion";
import { TURING_TIP_BUCKETS, TURING_TIP_KEYS } from "./turing-tips";
import { TuringProvider } from "./turing/turing-context";

const EN_TIPS = Object.values(TURING_TIP_BUCKETS)
  .flat()
  .map((k) => en.turing[k.split(".")[1] as keyof typeof en.turing]);
const ES_TIPS = TURING_TIP_KEYS.map((k) => es.turing[k.split(".")[1] as keyof typeof es.turing]);

function renderAt(path = "/my", locale?: "es") {
  if (locale) localStorage.setItem("tc-locale", locale);
  return render(
    <LocaleProvider>
      <TuringProvider>
        <MemoryRouter initialEntries={[path]}>
          <TuringCompanion />
        </MemoryRouter>
      </TuringProvider>
    </LocaleProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("TuringCompanion", () => {
  it("renders an accessible button labelled for the tip interaction", () => {
    renderAt();
    expect(screen.getByRole("button", { name: en.turing.tipAria })).toBeInTheDocument();
  });

  it("does not show a tip bubble until interacted with", () => {
    renderAt();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows one of the tips when clicked", () => {
    renderAt();
    fireEvent.click(screen.getByRole("button", { name: en.turing.tipAria }));
    expect(EN_TIPS).toContain(screen.getByRole("status").textContent);
  });

  it("hides the tip again after the display timeout elapses", () => {
    vi.useFakeTimers();
    renderAt();
    fireEvent.click(screen.getByRole("button", { name: en.turing.tipAria }));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3600);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("localizes the label and tips in Spanish", () => {
    renderAt("/my", "es");
    const button = screen.getByRole("button", { name: es.turing.tipAria });
    fireEvent.click(button);
    expect(ES_TIPS).toContain(screen.getByRole("status").textContent);
  });

  it("disables ambient animation when reduced motion is preferred", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    try {
      const { container } = renderAt();
      const animated = Array.from(container.querySelectorAll("g")).filter(
        (g) => g.style.animation && g.style.animation !== "none",
      );
      expect(animated).toHaveLength(0);
    } finally {
      window.matchMedia = original;
    }
  });

  it("exposes exactly the six tip catalog keys", () => {
    expect(TURING_TIP_KEYS).toEqual([
      "turing.tip1",
      "turing.tip2",
      "turing.tip3",
      "turing.tip4",
      "turing.tip5",
      "turing.tip6",
    ]);
  });

  it("shows a training-context tip on the training route", () => {
    renderAt("/my/dogs/abc/training");
    fireEvent.click(screen.getByRole("button", { name: en.turing.tipAria }));
    const trainingTips = TURING_TIP_BUCKETS.training.map(
      (k) => en.turing[k.split(".")[1] as keyof typeof en.turing],
    );
    expect(trainingTips).toContain(screen.getByRole("status").textContent);
  });
});
