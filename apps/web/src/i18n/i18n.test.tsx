import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en, es } from "@turingcare/i18n";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetActiveLocale } from "./active-locale";
import { LocaleProvider, detectInitialLocale, translate, useI18n } from "./index";

function keyPaths(o: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(o).flatMap(([key, value]) =>
    value && typeof value === "object"
      ? keyPaths(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

function ThrowingStorage(): Storage {
  return {
    get length() {
      return 0;
    },
    clear: vi.fn(),
    getItem: vi.fn(() => null),
    key: vi.fn(() => null),
    removeItem: vi.fn(),
    setItem: vi.fn(() => {
      throw new Error("storage unavailable");
    }),
  };
}

function LocaleProbe() {
  const { locale, selectLocale, t } = useI18n();

  return (
    <>
      <p>{t("nav.getStarted")}</p>
      <p data-testid="locale">{locale}</p>
      <button type="button" onClick={() => selectLocale("es")}>
        switch
      </button>
    </>
  );
}

afterEach(() => {
  resetActiveLocale();
  vi.unstubAllGlobals();
  document.documentElement.lang = "";
  localStorage.clear();
});

describe("detectInitialLocale", () => {
  it("uses a valid localStorage value over the browser", () => {
    localStorage.setItem("tc-locale", "es");
    vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });

    expect(detectInitialLocale()).toBe("es");
  });

  it("falls through invalid stored values to the browser locale", () => {
    localStorage.setItem("tc-locale", "fr");
    vi.stubGlobal("navigator", { language: "es-MX", languages: ["es-MX"] });

    expect(detectInitialLocale()).toBe("es");
  });

  it("respects browser-language ordering when English appears before a later Spanish variant", () => {
    vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US", "es-MX"] });

    expect(detectInitialLocale()).toBe("en");
  });

  it("defaults to en otherwise", () => {
    vi.stubGlobal("navigator", { language: "fr-FR", languages: ["fr-FR"] });

    expect(detectInitialLocale()).toBe("en");
  });
});

describe("translate", () => {
  it("resolves a dot path through the shared runtime", () => {
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
  it("sets the initial document language before its first child render", () => {
    vi.stubGlobal("navigator", { language: "es-MX", languages: ["es-MX"] });
    let childRenderLanguage = "";

    function FirstRenderProbe() {
      childRenderLanguage = document.documentElement.lang;
      return null;
    }

    render(
      <LocaleProvider>
        <FirstRenderProbe />
      </LocaleProvider>,
    );

    expect(childRenderLanguage).toBe("es");
  });

  it("sets html lang from the initial spanish locale", () => {
    vi.stubGlobal("navigator", { language: "es-MX", languages: ["es-MX"] });

    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => <LocaleProvider>{children}</LocaleProvider>,
    });

    expect(result.current.locale).toBe("es");
    expect(document.documentElement.lang).toBe("es");
  });

  it("keeps locale changes in memory when storage writes fail", () => {
    vi.stubGlobal("localStorage", ThrowingStorage());
    vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });

    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => <LocaleProvider>{children}</LocaleProvider>,
    });

    act(() => result.current.selectLocale("es"));

    expect(result.current.locale).toBe("es");
    expect(result.current.t("nav.getStarted")).toBe("Empezar");
  });

  it("rejects malformed runtime locale values without changing any locale sink", () => {
    localStorage.setItem("tc-locale", "en");
    vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });

    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => <LocaleProvider>{children}</LocaleProvider>,
    });

    let accepted: unknown;
    act(() => {
      accepted = result.current.selectLocale("fr" as never);
    });

    expect(accepted).toBe(false);
    expect(result.current.locale).toBe("en");
    expect(result.current.t("nav.getStarted")).toBe("Get started");
    expect(localStorage.getItem("tc-locale")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("tracks explicit selection intent separately from account-locale adoption", () => {
    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }) => <LocaleProvider>{children}</LocaleProvider>,
    });
    const context = result.current as typeof result.current & {
      adoptLocale?: (locale: unknown) => boolean;
      explicitSelectionRevision?: number;
    };

    expect(context.adoptLocale).toBeTypeOf("function");
    expect(context.explicitSelectionRevision).toBe(0);
    if (!context.adoptLocale) return;

    act(() => {
      expect(context.adoptLocale?.("es")).toBe(true);
    });
    expect(result.current.locale).toBe("es");
    expect((result.current as typeof context).explicitSelectionRevision).toBe(0);

    act(() => {
      result.current.selectLocale("en");
    });
    expect(result.current.locale).toBe("en");
    expect((result.current as typeof context).explicitSelectionRevision).toBe(1);
  });

  it("rerenders existing t() call sites after switching locale", async () => {
    vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });

    render(
      <LocaleProvider>
        <LocaleProbe />
      </LocaleProvider>,
    );

    expect(screen.getByText("Get started")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "switch" }));
    expect(screen.getByText("Empezar")).toBeInTheDocument();
    expect(screen.getByTestId("locale")).toHaveTextContent("es");
  });
});

describe("i18n catalogs", () => {
  it("keeps the English and Spanish catalogs in exact key parity", () => {
    expect(keyPaths(es).sort()).toEqual(keyPaths(en).sort());
  });
});
