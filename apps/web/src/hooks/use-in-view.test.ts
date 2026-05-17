import { renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useInView } from "./use-in-view";

afterEach(() => vi.unstubAllGlobals());

it("is visible immediately when reduced motion is preferred", () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;

  const { result } = renderHook(() => useInView<HTMLDivElement>());
  expect(result.current.isInView).toBe(true);
});

it("starts hidden when motion is allowed and not yet intersecting", () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;

  const { result } = renderHook(() => useInView<HTMLDivElement>());
  expect(result.current.isInView).toBe(false);
});
