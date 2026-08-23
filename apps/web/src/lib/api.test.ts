import { afterEach, describe, expect, it, vi } from "vitest";
import { authClient } from "./auth-client";
import { api, localeFetch } from "./api";

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
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await localeFetch("/health");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(latestHeaders(fetchSpy).get("X-TuringCare-Locale")).toBe("es");
  });

  it("preserves caller headers and does not clobber an existing locale header", async () => {
    const storage = createStorage();
    storage.setItem("tc-locale", "es");
    vi.stubGlobal("localStorage", storage);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

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
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

    await localeFetch("/health", {
      headers: { Accept: "application/json" },
    });

    expect(latestHeaders(fetchSpy).get("X-TuringCare-Locale")).toBeNull();
  });
});

describe("localized API clients", () => {
  it("wires localeFetch into the Hono client", async () => {
    const storage = createStorage();
    storage.setItem("tc-locale", "es");
    vi.stubGlobal("localStorage", storage);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }));

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
