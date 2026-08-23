import { describe, expect, it } from "vitest";
import { createI18n, en, es, isLocale, resolveBrowserLocale, translate } from "./index";

function keyPaths(o: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(o).flatMap(([key, value]) =>
    value && typeof value === "object"
      ? keyPaths(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

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

  it("falls back to English when the browser languages are unsupported", () => {
    expect(resolveBrowserLocale(["fr-FR", "pt-BR"])).toBe("en");
    expect(resolveBrowserLocale([])).toBe("en");
  });
});

describe("@turingcare/i18n runtime", () => {
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
