import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { courses } from "../db/schema";
import { type Vars, requireUser } from "../middleware/require-user";

export const coursesApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/", async (c) => {
    const ageGroup = c.req.query("ageGroup");
    const format = c.req.query("format");
    const state = c.req.query("state");
    const online = c.req.query("online");
    const conds = [];
    if (ageGroup) conds.push(eq(courses.ageGroup, ageGroup));
    if (format) conds.push(eq(courses.format, format));
    if (state) conds.push(eq(courses.state, state));
    if (online === "true") conds.push(eq(courses.isOnline, true));
    const rows = await db
      .select()
      .from(courses)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(courses.organizationName, courses.position);
    return c.json({ courses: rows });
  })
  .get("/:id", async (c) => {
    const [course] = await db.select().from(courses).where(eq(courses.id, c.req.param("id")));
    if (!course) return c.json({ error: "not_found" } as const, 404);
    return c.json({ course });
  });
