import { afterEach, describe, expect, it, vi } from "vitest";
import { briefGeneratedLabel } from "./brief-chrome";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("briefGeneratedLabel", () => {
  it.each([
    ["en", "Generated May 22, 2026"],
    ["es", "Generado 22 de mayo de 2026"],
  ] as const)("keeps a near-midnight UTC generated date stable in %s", (locale, expected) => {
    vi.stubEnv("TZ", "America/Los_Angeles");

    expect(briefGeneratedLabel("2026-05-22T00:30:00.000Z", locale)).toBe(expected);
  });
});
