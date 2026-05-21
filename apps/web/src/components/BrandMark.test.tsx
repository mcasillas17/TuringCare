import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BrandMark } from "./BrandMark";

describe("BrandMark", () => {
  it("renders the TuringCare wordmark", () => {
    render(<BrandMark />);
    expect(screen.getByText("TuringCare")).toBeInTheDocument();
  });
});
