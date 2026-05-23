import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "./en";
import { es } from "./es";
import { LocaleProvider, detectInitialLocale, translate, useI18n } from "./index";

function keyPaths(o: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("i18n catalogs", () => {
  it("es has exactly the same keys as en", () => {
    expect(keyPaths(es).sort()).toEqual(keyPaths(en).sort());
  });
  it("no es value is left equal to its en value (untranslated)", () => {
    const flat = (o: Record<string, unknown>, p = ""): [string, unknown][] =>
      Object.entries(o).flatMap(([k, v]) =>
        v && typeof v === "object"
          ? flat(v as Record<string, unknown>, `${p}${k}.`)
          : [[`${p}${k}`, v]],
      );
    const enF = Object.fromEntries(flat(en));
    const untranslated = flat(es)
      .filter(([k, v]) => v === enF[k])
      .map(([k]) => k)
      .filter(
        (k) =>
          ![
            "footer.brand",
            "language.en",
            "language.es",
            "language.nameEn",
            "language.nameEs",
          ].includes(k),
      );
    expect(untranslated).toEqual([]);
  });
});

describe("detectInitialLocale", () => {
  it("uses a valid localStorage value over the browser", () => {
    localStorage.setItem("tc-locale", "es");
    vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });
    expect(detectInitialLocale()).toBe("es");
  });
  it("falls back to browser Spanish when no stored choice", () => {
    vi.stubGlobal("navigator", { language: "es-MX", languages: ["es-MX"] });
    expect(detectInitialLocale()).toBe("es");
  });
  it("defaults to en otherwise", () => {
    vi.stubGlobal("navigator", { language: "fr-FR", languages: ["fr-FR"] });
    expect(detectInitialLocale()).toBe("en");
  });
});

describe("translate", () => {
  it("resolves a dot path (es)", () => {
    expect(translate("es", "nav.getStarted")).toBe("Empezar");
  });
  it("returns a non-empty string for a valid key", () => {
    expect(translate("en", "common.loading").length).toBeGreaterThan(0);
  });
  it("returns the key when missing", () => {
    // @ts-expect-error intentional bad key
    expect(translate("en", "nope.missing")).toBe("nope.missing");
  });
});

describe("useI18n + LocaleProvider", () => {
  it("switches language and persists", () => {
    vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });
    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => <LocaleProvider>{children}</LocaleProvider>,
    });
    expect(result.current.t("nav.getStarted")).toBe("Get started");
    act(() => result.current.setLocale("es"));
    expect(result.current.t("nav.getStarted")).toBe("Empezar");
    expect(localStorage.getItem("tc-locale")).toBe("es");
  });
});
