import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../db";
import { events } from "../db/schema";
import { purgeOldEvents, retentionCutoff } from "./retention";

const marker = `retention_test_${Date.now()}`;

afterAll(async () => {
  await db.delete(events).where(eq(events.name, marker));
});

describe("retention", () => {
  it("retentionCutoff subtracts the right number of days", () => {
    const now = new Date("2026-05-17T00:00:00.000Z");
    expect(retentionCutoff(now, 180).toISOString()).toBe("2025-11-18T00:00:00.000Z");
  });

  it("purgeOldEvents deletes only rows older than the cutoff", async () => {
    const old = new Date(Date.now() - 200 * 86_400_000);
    const recent = new Date();
    await db.insert(events).values([
      { name: marker, props: {}, createdAt: old },
      { name: marker, props: {}, createdAt: recent },
    ]);

    const deleted = await purgeOldEvents(db, 180);
    expect(deleted).toBeGreaterThanOrEqual(1);

    const left = await db.select().from(events).where(eq(events.name, marker));
    expect(left).toHaveLength(1);
    expect(left[0]?.createdAt.getTime()).toBeGreaterThan(old.getTime());
  });
});
