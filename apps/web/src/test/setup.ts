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

  // No-op stub: planned tests only assert initial/stable state (the
  // reduced-motion short-circuit and the not-yet-intersecting case) and never
  // simulate intersection events, so capturing the callback would be unused.
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  // Use direct assignment (not vi.stubGlobal) so that vi.unstubAllGlobals()
  // called in test afterEach hooks does not remove this stub between tests.
  (window as unknown as Record<string, unknown>).IntersectionObserver = IO;

  // Radix Popover/Popper needs ResizeObserver under jsdom; direct assignment
  // (not vi.stubGlobal) so vi.unstubAllGlobals() in test afterEach hooks keeps it.
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (window as unknown as Record<string, unknown>).ResizeObserver = RO;

  // jsdom lacks these element methods that Radix's dismissable layer / popper call.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}
