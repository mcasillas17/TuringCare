import { afterEach, describe, expect, it, vi } from "vitest";
import {
  briefGeneratedLabel,
  briefStatusLabel,
  briefTitle,
  briefVersionLabel,
  sharedBriefTitle,
} from "./brief-chrome";

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

describe("brief chrome labels", () => {
  it("renders exact catalog strings and falls back to English", () => {
    expect([briefTitle("es"), sharedBriefTitle("en"), briefVersionLabel("xx")]).toEqual([
      "Resumen de conducta",
      "Shared Behavior Brief",
      "Version",
    ]);
    expect(briefStatusLabel("finalized", 3, "en")).toBe("Final · v3");
    expect(briefStatusLabel("draft", 2, "es")).toBe("Borrador · v2");
    expect(briefStatusLabel("finalized", 1, "es")).toBe("Definitivo · v1");
  });
});
