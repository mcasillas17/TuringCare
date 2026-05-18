import { desc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { app } from "./app";
import { db } from "./db";
import { events } from "./db/schema";

describe("POST /api/events", () => {
  it("rejects an event name not on the client allowlist", async () => {
    const res = await app.request("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "user.signed_in", props: {} }),
    });
    expect(res.status).toBe(400);
  });

  it("persists an anonymous page.viewed (userId null)", async () => {
    const path = `/test-${Date.now()}`;
    const res = await app.request("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "page.viewed", props: { path } }),
    });
    expect(res.status).toBe(202);

    const [row] = await db
      .select()
      .from(events)
      .where(eq(events.name, "page.viewed"))
      .orderBy(desc(events.createdAt))
      .limit(1);
    expect(row?.props).toMatchObject({ path });
    expect(row?.userId).toBeNull();
  });
});
