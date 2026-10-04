import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Guard: setup.ts is loaded even for @vitest-environment node tests; skip
// browser-only globals when window is not available.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }

  // jsdom lacks scrollIntoView.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}
