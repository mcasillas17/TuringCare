import type { Locale } from "@turingcare/i18n";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { localeMiddleware } from "./locale";

type LocaleEnv = { Variables: { locale: Locale } };

function buildApp() {
  return new Hono<LocaleEnv>()
    .use("*", localeMiddleware)
    .get("/x", (c) => c.json({ locale: c.get("locale") }));
}

describe("localeMiddleware", () => {
  it("prefers a valid X-TuringCare-Locale over Accept-Language", async () => {
    const app = buildApp();
    const res = await app.request("/x", {
      headers: {
        "X-TuringCare-Locale": "es",
        "Accept-Language": "en-US,en;q=0.8",
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Language")).toBe("es");
    expect(await res.json()).toEqual({ locale: "es" });
  });

  it("accepts supported Accept-Language values case-insensitively", async () => {
    const app = buildApp();
    const res = await app.request("/x", {
      headers: { "Accept-Language": "ES-mx,EN;q=0.8" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Language")).toBe("es");
    expect(await res.json()).toEqual({ locale: "es" });
  });

  it("prefers the highest-weight supported Accept-Language", async () => {
    const app = buildApp();
    const res = await app.request("/x", {
      headers: { "Accept-Language": "es;q=0.1,en;q=0.9" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Language")).toBe("en");
    expect(await res.json()).toEqual({ locale: "en" });
  });

  it("rejects q=0 Accept-Language entries", async () => {
    const app = buildApp();
    const res = await app.request("/x", {
      headers: { "Accept-Language": "es;q=0,en;q=0.5" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Language")).toBe("en");
    expect(await res.json()).toEqual({ locale: "en" });
  });

  it("ignores malformed Accept-Language q-values", async () => {
    const app = buildApp();
    const res = await app.request("/x", {
      headers: { "Accept-Language": "en;q=bogus,es;q=0.9" },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Language")).toBe("es");
    expect(await res.json()).toEqual({ locale: "es" });
  });

  it("preserves order for equal or default Accept-Language weights", async () => {
    const app = buildApp();
    const weighted = await app.request("/x", {
      headers: { "Accept-Language": "en;q=0.7,es;q=0.7" },
    });
    const defaulted = await app.request("/x", {
      headers: { "Accept-Language": "es,en" },
    });

    expect(weighted.status).toBe(200);
    expect(weighted.headers.get("Content-Language")).toBe("en");
    expect(await weighted.json()).toEqual({ locale: "en" });

    expect(defaulted.status).toBe(200);
    expect(defaulted.headers.get("Content-Language")).toBe("es");
    expect(await defaulted.json()).toEqual({ locale: "es" });
  });

  it("falls back from an invalid locale header to a supported Accept-Language", async () => {
    const app = buildApp();
    const res = await app.request("/x", {
      headers: {
        "X-TuringCare-Locale": "fr",
        "Accept-Language": "es-419,es;q=0.9",
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Language")).toBe("es");
    expect(await res.json()).toEqual({ locale: "es" });
  });

  it("falls back from an oversized locale header to a supported Accept-Language", async () => {
    const app = buildApp();
    const res = await app.request("/x", {
      headers: {
        "X-TuringCare-Locale": `es-${"x".repeat(32)}`,
        "Accept-Language": "es-419,es;q=0.9",
      },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Language")).toBe("es");
    expect(await res.json()).toEqual({ locale: "es" });
  });

  it("falls back to en when Accept-Language is oversized", async () => {
    const app = buildApp();
    const oversized = `es-${"x".repeat(512)}`;
    const res = await app.request("/x", {
      headers: { "Accept-Language": oversized },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Language")).toBe("en");
    expect(await res.json()).toEqual({ locale: "en" });
  });
});
