import { and, arrayContains, eq } from "drizzle-orm";
import { Hono } from "hono";
import { getAuthoritativeSession } from "../auth/session";
import { db } from "../db";
import { trainers } from "../db/schema";

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

export const trainersApp = new Hono()
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
    // List NEVER exposes contact (bulk-scrape surface), even when authed.
    return c.json({ trainers: rows.map((t) => ({ ...t, email: null, phone: null })) });
  })
  .get("/:id", async (c) => {
    const [trainer] = await db
      .select(TRAINER_COLS)
      .from(trainers)
      .where(eq(trainers.id, c.req.param("id")));
    if (!trainer) return c.json({ error: "not_found" } as const, 404);
    // Detail reveals contact ONLY to verified authenticated users.
    const session = await getAuthoritativeSession(c.req.raw.headers);
    return c.json({
      trainer:
        session?.user.emailVerified === true ? trainer : { ...trainer, email: null, phone: null },
    });
  });
