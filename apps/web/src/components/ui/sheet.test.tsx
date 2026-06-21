import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./sheet";

describe("Sheet", () => {
  it("renders title + children when open and closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="Log a moment" onClose={onClose}>
        <p>body</p>
      </Sheet>,
    );
    expect(screen.getByRole("dialog", { name: "Log a moment" })).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <Sheet open={false} title="x" onClose={() => {}}>
        <p>body</p>
      </Sheet>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <Sheet open title="x" onClose={onClose}>
        <p>body</p>
      </Sheet>,
    );
    fireEvent.click(screen.getByTestId("sheet-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
