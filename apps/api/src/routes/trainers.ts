import { and, arrayContains, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { trainers } from "../db/schema";
import { type Vars, requireUser } from "../middleware/require-user";

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

export const trainersApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
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
    return c.json({ trainers: rows });
  })
  .get("/:id", async (c) => {
    const [trainer] = await db
      .select(TRAINER_COLS)
      .from(trainers)
      .where(eq(trainers.id, c.req.param("id")));
    if (!trainer) return c.json({ error: "not_found" } as const, 404);
    return c.json({ trainer });
  });
