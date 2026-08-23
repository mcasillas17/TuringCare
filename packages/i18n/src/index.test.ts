import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n, en, es, isLocale, resolveBrowserLocale, translate } from "./index";

function keyPaths(o: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(o).flatMap(([key, value]) =>
    value && typeof value === "object"
      ? keyPaths(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).__i18next_supportNoticeShown;
  vi.restoreAllMocks();
});

describe("@turingcare/i18n locale helpers", () => {
  it("allowlists only the supported locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("es")).toBe(true);
    expect(isLocale("es-MX")).toBe(false);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it("resolves browser Spanish variants to the Spanish locale", () => {
    expect(resolveBrowserLocale(["es-MX", "en-US"])).toBe("es");
  });

  it("respects browser-language ordering when English appears before a later Spanish variant", () => {
    expect(resolveBrowserLocale(["en-US", "es-MX"])).toBe("en");
  });

  it("falls back to English when the browser languages are unsupported", () => {
    expect(resolveBrowserLocale(["fr-FR", "pt-BR"])).toBe("en");
    expect(resolveBrowserLocale([])).toBe("en");
  });
});

describe("@turingcare/i18n runtime", () => {
  it("initializes without emitting the i18next support banner", () => {
    delete (globalThis as Record<string, unknown>).__i18next_supportNoticeShown;
    const info = vi.spyOn(console, "info");

    createI18n("en");

    expect(info).not.toHaveBeenCalled();
  });

  it("interpolates variables through the shared translator", () => {
    const i18n = createI18n("es");

    expect(translate(i18n, "language.switchTo", { lang: "English" })).toBe("Cambiar a English");
  });
});

describe("@turingcare/i18n catalogs", () => {
  it("keeps the English and Spanish catalogs in exact key parity", () => {
    expect(keyPaths(es).sort()).toEqual(keyPaths(en).sort());
  });
});
