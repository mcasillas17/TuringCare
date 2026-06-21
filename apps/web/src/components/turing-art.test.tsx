import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TuringArt } from "./turing-art";

const base = {
  pupilStyle: { transform: "translate(0px,0px)" },
  eyesClosed: false,
};

describe("TuringArt poses", () => {
  it("celebrate wraps the figure in a hop animation", () => {
    const { container } = render(
      <TuringArt {...base} pose="celebrate" reduceMotion={false} />,
    );
    const hop = Array.from(container.querySelectorAll("g")).some((g) =>
      (g.getAttribute("style") ?? "").includes("tg-hop"),
    );
    expect(hop).toBe(true);
  });

  it("sleep shows the floating zzz text", () => {
    const { container } = render(<TuringArt {...base} pose="sleep" eyesClosed reduceMotion={false} />);
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts.filter((t) => t === "z").length).toBeGreaterThanOrEqual(3);
  });

  it("idle does not render zzz", () => {
    const { container } = render(<TuringArt {...base} pose="idle" reduceMotion={false} />);
    expect(container.querySelectorAll("text").length).toBe(0);
  });

  it("reduced motion removes looping animations", () => {
    const { container } = render(<TuringArt {...base} pose="celebrate" reduceMotion />);
    const anyLoop = Array.from(container.querySelectorAll("g, svg")).some((el) => {
      const s = el.getAttribute("style") ?? "";
      return /tg-(hop|wag|sway|breathe)/.test(s);
    });
    expect(anyLoop).toBe(false);
  });
});
