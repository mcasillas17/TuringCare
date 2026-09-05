import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { en, es } from "@turingcare/i18n";
import { useTranslation } from "react-i18next";
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

function ReactI18nextProbe() {
  const { i18n, t } = useTranslation();
  const { selectLocale } = useI18n();

  return (
    <>
      <p data-testid="react-i18next-message">{t("nav.getStarted")}</p>
      <p data-testid="react-i18next-language">{i18n.language ?? "unset"}</p>
      <button type="button" onClick={() => selectLocale("es")}>
        switch react i18next
      </button>
    </>
  );
}

const task18Sections = ["suggestion", "practice", "safety"] as const;

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([^}]+)\}/g)]
    .flatMap((match) => (match[1] ? [match[1]] : []))
    .sort();
}

afterEach(() => {
  resetActiveLocale();
  vi.unstubAllGlobals();
  document.documentElement.lang = "";
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

it("persists only a validated fresh email hint across login and a query-free app load", () => {
  vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });
  window.history.replaceState({}, "", "/verify-email?lang=es");
  expect(detectInitialLocale()).toBe("es");
  expect(localStorage.getItem("tc-locale")).toBe("es");
  resetActiveLocale();
  window.history.replaceState({}, "", "/login?lang=es");
  expect(detectInitialLocale()).toBe("es");
  resetActiveLocale();
  window.history.replaceState({}, "", "/my");
  expect(detectInitialLocale()).toBe("es");
});

it("ignores invalid hints and does not overwrite an existing valid local choice", () => {
  vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });
  window.history.replaceState({}, "", "/verify-email?lang=fr");
  expect(detectInitialLocale()).toBe("en");
  expect(localStorage.getItem("tc-locale")).toBeNull();
  localStorage.setItem("tc-locale", "en");
  window.history.replaceState({}, "", "/verify-email?lang=es");
  expect(detectInitialLocale()).toBe("en");
  expect(localStorage.getItem("tc-locale")).toBe("en");
});

it("uses a validated app continuation locale when browser storage is unavailable", () => {
  vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });
  vi.stubGlobal("localStorage", ThrowingStorage());
  window.history.replaceState({}, "", "/my/profile?lang=es");
  expect(detectInitialLocale()).toBe("es");
});

describe("i18n catalogs", () => {
  it("es has exactly the same keys as en", () => {
    expect(keyPaths(es).sort()).toEqual(keyPaths(en).sort());
  });
  it("includes all Task 18 suggestion, practice, and safety keys", () => {
    const task18Keys = {
      suggestion: [
        "title",
        "forSkill",
        "levelLabel",
        "primaryLabel",
        "fallbackLabel",
        "fallbackSameLevel",
        "reasonColdStart",
        "reasonStepBack",
        "reasonEase",
        "reasonContext",
        "reasonHold",
        "reasonMaintain",
        "evidence",
        "noEvidence",
        "needsFocusTitle",
        "needsFocusBody",
        "needsFocusCta",
        "customTitle",
        "customBody",
        "actionStarted",
        "actionSkipped",
        "changeFocus",
        "skippedTitle",
        "skippedBody",
        "rateUseful",
        "rateNotUseful",
        "actionThanks",
        "actionFailed",
        "loadError",
        "advTitle",
        "advBody",
        "advEvidence",
        "advConfirm",
        "advStayed",
        "advRejected",
        "advRegressed",
        "advInsufficient",
        "advSaved",
        "advFailed",
      ],
      practice: [
        "outcomeQuestion",
        "outcomeWentWell",
        "outcomeMixed",
        "outcomeTooHard",
        "outcomeSkip",
        "saveEvidence",
        "practicedVersion",
        "practicedPrimary",
        "practicedFallback",
        "outcomeSaved",
        "outcomeFailed",
        "anchorRejectedPracticeDay",
        "anchorRejectedTargetLocked",
        "anchorRejectedGeneric",
        "auditedAnchorOmitted",
        "contextTitle",
        "contextOptional",
        "dimCueSupport",
        "dimEnvironment",
        "dimDistance",
        "dimDuration",
        "dimDistraction",
        "easeAddCueHelp",
        "easeQuieterEnvironment",
        "easeIncreaseTriggerDistance",
        "easeDecreaseOwnerDistance",
        "easeShortenDuration",
        "easeReduceDistractions",
        "cueSupportLabel",
        "cueFoodLure",
        "cueHandSignal",
        "cueVerbalCue",
        "cueNoExtraHelp",
        "environmentLabel",
        "envHomeQuiet",
        "envHomeBusy",
        "envYard",
        "envQuietOutdoor",
        "envBusyOutdoor",
        "distanceLabel",
        "distAtSide",
        "distFewSteps",
        "distAcrossRoom",
        "distAcrossYard",
        "distFarAway",
        "durationLabel",
        "durUnder5",
        "durAbout15",
        "durAbout30",
        "durOneToTwo",
        "durFiveToFifteen",
        "durAboutThirtyMinutes",
        "durOneToTwoHours",
        "durHalfDayPlus",
        "distractionLabel",
        "distractionNone",
        "distractionMild",
        "distractionModerate",
        "distractionStrong",
        "safetyLabel",
        "safetyNone",
        "safetyConfirm",
        "futureSession",
        "safetyAggression",
        "safetyInjury",
        "safetyFear",
      ],
      safety: [
        "title",
        "bodyInjury",
        "bodyAggression",
        "bodyFear",
        "bodySevereConcern",
        "bodyWorsening",
        "referralVeterinarian",
        "referralBehaviorist",
        "referralTrainer",
        "directoryTitle",
        "directoryDacvb",
        "directoryCcpdt",
        "directoryIaabc",
        "directoryFearFree",
        "keepLogging",
      ],
    };
    const catalog = en as unknown as Record<string, Record<string, string>>;

    for (const [section, keys] of Object.entries(task18Keys)) {
      expect(Object.keys(catalog[section] ?? {}).sort()).toEqual(keys.sort());
    }
  });
  it("has non-empty Task 18 translations with matching placeholders", () => {
    const enCatalog = en as unknown as Record<string, Record<string, string>>;
    const esCatalog = es as unknown as Record<string, Record<string, string>>;

    for (const section of task18Sections) {
      for (const key of Object.keys(enCatalog[section] ?? {})) {
        const english = enCatalog[section]?.[key] ?? "";
        const spanish = esCatalog[section]?.[key] ?? "";

        expect(english.trim(), `en.${section}.${key}`).not.toBe("");
        expect(spanish.trim(), `es.${section}.${key}`).not.toBe("");
        expect(placeholders(spanish), `es.${section}.${key}`).toEqual(placeholders(english));
      }
    }
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
          // Brand name and locale codes are identical by design. "Total" is
          // the same word in both languages, and goalProgress is a formatting-
          // only template whose localized content arrives through placeholders.
          // The delete-account confirm word is kept as "delete" in both locales
          // as deliberate friction — it's the literal the user must type.
          ![
            "admin.total",
            "footer.brand",
            "generatedBrief.goalProgress",
            "language.en",
            "language.es",
            "language.nameEn",
            "language.nameEs",
            "settings.deleteConfirmWord",
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

  it("provides one active react-i18next runtime synchronized on initial render and locale switches", async () => {
    localStorage.setItem("tc-locale", "en");

    render(
      <LocaleProvider>
        <ReactI18nextProbe />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("react-i18next-message")).toHaveTextContent("Get started");
    expect(screen.getByTestId("react-i18next-language")).toHaveTextContent("en");

    await userEvent.click(screen.getByRole("button", { name: "switch react i18next" }));

    expect(screen.getByTestId("react-i18next-message")).toHaveTextContent("Empezar");
    expect(screen.getByTestId("react-i18next-language")).toHaveTextContent("es");
  });
});

describe("i18n catalogs", () => {
  it("keeps the English and Spanish catalogs in exact key parity", () => {
    expect(keyPaths(es).sort()).toEqual(keyPaths(en).sort());
  });
});
