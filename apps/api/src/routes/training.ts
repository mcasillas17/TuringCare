import { Hono } from "hono";
import { trainingCatalog } from "../data/training-catalog";
import { type Vars, requireUser } from "../middleware/require-user";

export const trainingApp = new Hono<{ Variables: Vars }>()
  .use("*", requireUser)
  .get("/templates", (c) => c.json({ templates: trainingCatalog }));
