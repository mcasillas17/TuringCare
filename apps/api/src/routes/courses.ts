import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { courses } from "../db/schema";
import { type OptionalVars, optionalUser } from "../middleware/optional-user";
import { recordEvent } from "../telemetry/record-event";

export const coursesApp = new Hono<{ Variables: OptionalVars }>()
  .use("*", optionalUser)
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
    if (conds.length > 0) {
      await recordEvent("directory.courses_searched", {
        userId: c.get("userId"),
        props: {
          hasAgeGroup: ageGroup !== undefined,
          hasFormat: format !== undefined,
          hasState: state !== undefined,
          online: online === "true",
          resultCount: rows.length,
        },
      });
    }
    return c.json({ courses: rows });
  })
  .get("/:id", async (c) => {
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, c.req.param("id")));
    if (!course) return c.json({ error: "not_found" } as const, 404);
    return c.json({ course });
  });
