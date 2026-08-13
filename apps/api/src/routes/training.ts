import { Hono } from "hono";
import { trainingCurriculum } from "../data/training-curriculum";
import { type Vars, requireUser } from "../middleware/require-user";

export const trainingApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/templates", (c) => c.json({ templates: trainingCurriculum }));
