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
  Reflect.deleteProperty(globalThis, "__i18next_supportNoticeShown");
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

  it("accepts valid regional variants case-insensitively", () => {
    expect(resolveBrowserLocale(["EN-us", "es-419"])).toBe("en");
    expect(resolveBrowserLocale(["eS-419", "en-US"])).toBe("es");
  });

  it("respects browser-language ordering when English appears before a later Spanish variant", () => {
    expect(resolveBrowserLocale(["en-US", "es-MX"])).toBe("en");
  });

  it("falls back to English when the browser languages are unsupported", () => {
    expect(resolveBrowserLocale(["fr-FR", "pt-BR"])).toBe("en");
    expect(resolveBrowserLocale([])).toBe("en");
  });

  it("does not treat an arbitrary language beginning with es as Spanish", () => {
    expect(resolveBrowserLocale(["esoteric"])).toBe("en");
  });

  it("rejects malformed one-character browser subtags", () => {
    expect(resolveBrowserLocale(["es-x"])).toBe("en");
    expect(resolveBrowserLocale(["es-1"])).toBe("en");
  });

  it("enforces a hard 64-character browser-language maximum", () => {
    const atMaximum = "es-x-aaaaaaaa-bbbbbbbb-cccccccc-dddddddd-eeeeeee-fffffff-ggggggg";
    const overMaximum = "es-x-aaaaaaaa-bbbbbbbb-cccccccc-dddddddd-eeeeeeee-fffffff-ggggggg";

    expect(atMaximum).toHaveLength(64);
    expect(overMaximum).toHaveLength(65);
    expect(resolveBrowserLocale([atMaximum])).toBe("es");
    expect(resolveBrowserLocale([overMaximum])).toBe("en");
  });
});

describe("@turingcare/i18n runtime", () => {
  it("initializes without emitting the i18next support banner", () => {
    Reflect.deleteProperty(globalThis, "__i18next_supportNoticeShown");
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

  it("serves every generated-artifact namespace through the shared runtime", () => {
    const i18n = createI18n("es");

    expect([
      translate(i18n, "generatedBrief.concerns"),
      translate(i18n, "authEmail.verification.subject"),
      translate(i18n, "briefEmail.sharedBy"),
      translate(i18n, "briefPdf.labels.generated"),
    ]).toEqual([
      "Preocupaciones:",
      "Verifica tu correo de TuringCare",
      "Compartido por",
      "Generado",
    ]);
  });
});
