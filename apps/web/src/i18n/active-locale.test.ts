import type { Locale } from "@turingcare/i18n";
import { afterEach, describe, expect, it } from "vitest";
import * as activeLocaleState from "./active-locale";

afterEach(() => activeLocaleState.resetActiveLocale());

describe("active locale state", () => {
  it("keeps only allowlisted locale values", () => {
    expect(activeLocaleState.setActiveLocale("en")).toBe(true);
    expect(activeLocaleState.setActiveLocale("fr" as Locale)).toBe(false);
    expect(activeLocaleState.getActiveLocale()).toBe("en");
  });

  it("offers an explicit reset so app and test lifecycles cannot inherit stale locale state", () => {
    activeLocaleState.setActiveLocale("es");

    expect(activeLocaleState).toHaveProperty("resetActiveLocale");
    const resetActiveLocale = Reflect.get(activeLocaleState, "resetActiveLocale");
    expect(resetActiveLocale).toBeTypeOf("function");
    if (typeof resetActiveLocale !== "function") return;

    resetActiveLocale();
    expect(activeLocaleState.getActiveLocale()).toBeNull();
  });
});
