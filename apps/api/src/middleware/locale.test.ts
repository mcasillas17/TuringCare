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
