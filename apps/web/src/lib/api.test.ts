import { act, renderHook } from "@testing-library/react";
import { type ReactNode, createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider, useI18n } from "../i18n";
import { api, localeFetch } from "./api";
import { authClient } from "./auth-client";

type FetchSpy = {
  mock: {
    calls: Array<[RequestInfo | URL, RequestInit?]>;
  };
};

function createStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function createDeniedStorage(): Storage {
  const unavailable = () => {
    throw new DOMException("Storage access denied", "SecurityError");
  };

  return {
    get length() {
      return 0;
    },
    clear: unavailable,
    getItem: unavailable,
    key: unavailable,
    removeItem: unavailable,
    setItem: unavailable,
  };
}

function latestHeaders(fetchSpy: FetchSpy) {
  return new Headers(fetchSpy.mock.calls.at(-1)?.[1]?.headers);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("localeFetch", () => {
  it("attaches the stored locale header for valid locales", async () => {
    const storage = createStorage();
    storage.setItem("tc-locale", "es");
    vi.stubGlobal("localStorage", storage);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await localeFetch("/health");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(latestHeaders(fetchSpy).get("X-TuringCare-Locale")).toBe("es");
  });

  it("preserves caller headers and does not clobber an existing locale header", async () => {
    const storage = createStorage();
    storage.setItem("tc-locale", "es");
    vi.stubGlobal("localStorage", storage);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await localeFetch("/health", {
      headers: {
        Authorization: "Bearer token",
        "X-TuringCare-Locale": "en",
      },
    });

    const headers = latestHeaders(fetchSpy);
    expect(headers.get("Authorization")).toBe("Bearer token");
    expect(headers.get("X-TuringCare-Locale")).toBe("en");
  });

  it("ignores malformed stored values instead of sending an arbitrary locale header", async () => {
    const storage = createStorage();
    storage.setItem("tc-locale", "fr");
    vi.stubGlobal("localStorage", storage);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await localeFetch("/health", {
      headers: { Accept: "application/json" },
    });

    expect(latestHeaders(fetchSpy).get("X-TuringCare-Locale")).toBeNull();
  });

  it("uses the active selected locale when browser storage reads and writes are denied", async () => {
    vi.stubGlobal("localStorage", createDeniedStorage());
    vi.stubGlobal("navigator", { language: "en-US", languages: ["en-US"] });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { result } = renderHook(() => useI18n(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(LocaleProvider, null, children),
    });

    act(() => result.current.selectLocale("es"));
    await localeFetch("/health");

    expect(latestHeaders(fetchSpy).get("X-TuringCare-Locale")).toBe("es");
  });

  it("merges Request headers with init headers and preserves init precedence", async () => {
    const storage = createStorage();
    storage.setItem("tc-locale", "es");
    vi.stubGlobal("localStorage", storage);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const request = new Request("https://example.test/health", {
      headers: { Authorization: "Bearer request", Accept: "text/plain" },
    });

    await localeFetch(request, {
      headers: { Authorization: "Bearer init", "X-Trace-Id": "trace-1" },
    });

    const headers = latestHeaders(fetchSpy);
    expect(headers.get("Authorization")).toBe("Bearer init");
    expect(headers.get("Accept")).toBe("text/plain");
    expect(headers.get("X-Trace-Id")).toBe("trace-1");
    expect(headers.get("X-TuringCare-Locale")).toBe("es");
  });
});

describe("localized API clients", () => {
  it("wires localeFetch into the Hono client", async () => {
    const storage = createStorage();
    storage.setItem("tc-locale", "es");
    vi.stubGlobal("localStorage", storage);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));

    await api.health.$get();

    expect(latestHeaders(fetchSpy).get("X-TuringCare-Locale")).toBe("es");
  });

  it("wires localeFetch into the Better Auth client", async () => {
    const storage = createStorage();
    storage.setItem("tc-locale", "es");
    vi.stubGlobal("localStorage", storage);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: null, error: null }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await authClient.getSession();

    expect(latestHeaders(fetchSpy).get("X-TuringCare-Locale")).toBe("es");
  });
});
