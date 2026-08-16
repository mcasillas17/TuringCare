import { and, arrayContains, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { trainers } from "../db/schema";
import { type OptionalVars, optionalUser } from "../middleware/optional-user";
import { recordEvent } from "../telemetry/record-event";

const TRAINER_COLS = {
  id: trainers.id,
  name: trainers.name,
  businessName: trainers.businessName,
  city: trainers.city,
  state: trainers.state,
  methodologyTags: trainers.methodologyTags,
  certifications: trainers.certifications,
  specialties: trainers.specialties,
  website: trainers.website,
  email: trainers.email,
  phone: trainers.phone,
} as const;

export const trainersApp = new Hono<{ Variables: OptionalVars }>()
  .use("*", optionalUser)
  .get("/", async (c) => {
    const state = c.req.query("state");
    const specialty = c.req.query("specialty");
    const methodology = c.req.query("methodology");
    const conds = [];
    if (state) conds.push(eq(trainers.state, state));
    if (specialty) conds.push(arrayContains(trainers.specialties, [specialty]));
    if (methodology) conds.push(arrayContains(trainers.methodologyTags, [methodology]));
    const rows = await db
      .select(TRAINER_COLS)
      .from(trainers)
      .where(conds.length ? and(...conds) : undefined);
    if (conds.length > 0) {
      await recordEvent("directory.trainers_searched", {
        userId: c.get("userId"),
        props: {
          state: state ?? "any",
          specialty: specialty ?? "any",
          methodology: methodology ?? "any",
          resultCount: rows.length,
        },
      });
    }
    // List NEVER exposes contact (bulk-scrape surface), even when authed.
    return c.json({ trainers: rows.map((t) => ({ ...t, email: null, phone: null })) });
  })
  .get("/:id", async (c) => {
    const [trainer] = await db
      .select(TRAINER_COLS)
      .from(trainers)
      .where(eq(trainers.id, c.req.param("id")));
    if (!trainer) return c.json({ error: "not_found" } as const, 404);
    // Detail reveals contact ONLY to authenticated users.
    return c.json({
      trainer: c.get("userId") ? trainer : { ...trainer, email: null, phone: null },
    });
  });
