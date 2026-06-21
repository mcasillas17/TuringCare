import { en } from "@/i18n/en";
import { es } from "@/i18n/es";
import { LocaleProvider } from "@/i18n/index";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TuringCompanion } from "./turing-companion";
import { TURING_TIP_KEYS } from "./turing-tips";

const EN_TIPS = TURING_TIP_KEYS.map((k) => en.turing[k.split(".")[1] as keyof typeof en.turing]);
const ES_TIPS = TURING_TIP_KEYS.map((k) => es.turing[k.split(".")[1] as keyof typeof es.turing]);

function renderEs(ui: ReactElement) {
  localStorage.setItem("tc-locale", "es");
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("TuringCompanion", () => {
  it("renders an accessible button labelled for the tip interaction", () => {
    render(<TuringCompanion />);
    expect(screen.getByRole("button", { name: en.turing.tipAria })).toBeInTheDocument();
  });

  it("does not show a tip bubble until interacted with", () => {
    render(<TuringCompanion />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows one of the training tips when clicked", () => {
    render(<TuringCompanion />);
    fireEvent.click(screen.getByRole("button", { name: en.turing.tipAria }));
    expect(EN_TIPS).toContain(screen.getByRole("status").textContent);
  });

  it("hides the tip again after the display timeout elapses", () => {
    vi.useFakeTimers();
    render(<TuringCompanion />);
    fireEvent.click(screen.getByRole("button", { name: en.turing.tipAria }));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3600);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("localizes the label and tips in Spanish", () => {
    renderEs(<TuringCompanion />);
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
      const { container } = render(<TuringCompanion />);
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
});
