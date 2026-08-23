import type { Locale } from "@turingcare/i18n";
import { describe, expect, it } from "vitest";
import { getActiveLocale, setActiveLocale } from "./active-locale";

describe("active locale state", () => {
  it("keeps only allowlisted locale values", () => {
    expect(setActiveLocale("en")).toBe(true);
    expect(setActiveLocale("fr" as Locale)).toBe(false);
    expect(getActiveLocale()).toBe("en");
  });
});
