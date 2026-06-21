import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TuringCompanion } from "./turing-companion";
import { TURING_TIPS } from "./turing-tips";

afterEach(() => {
  vi.useRealTimers();
});

describe("TuringCompanion", () => {
  it("renders an accessible button labelled for the tip interaction", () => {
    render(<TuringCompanion />);
    const button = screen.getByRole("button", {
      name: /turing.*tip/i,
    });
    expect(button).toBeInTheDocument();
  });

  it("does not show a tip bubble until interacted with", () => {
    render(<TuringCompanion />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows one of the training tips when clicked", () => {
    render(<TuringCompanion />);
    fireEvent.click(screen.getByRole("button", { name: /turing.*tip/i }));
    const bubble = screen.getByRole("status");
    expect(TURING_TIPS).toContain(bubble.textContent);
  });

  it("hides the tip again after the display timeout elapses", () => {
    vi.useFakeTimers();
    render(<TuringCompanion />);
    fireEvent.click(screen.getByRole("button", { name: /turing.*tip/i }));
    expect(screen.getByRole("status")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(3600);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
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

  it("exposes exactly the six approved training tips", () => {
    expect(TURING_TIPS).toEqual([
      "Catch him being good — then reward it.",
      "Mark the moment, then treat.",
      "Short sessions beat long ones.",
      "Reward what you want repeated.",
      "Calm earns the treat, not the jump.",
      "End every session on a win.",
    ]);
  });
});
