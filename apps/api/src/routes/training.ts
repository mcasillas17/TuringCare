import type { Locale } from "@turingcare/i18n";
import { Hono } from "hono";
import { getTrainingCatalog } from "../data/training-catalog";
import { type Vars, requireUser } from "../middleware/require-user";

export const trainingApp = new Hono<{ Variables: Vars & { locale: Locale } }>()
  .use("*", requireUser)
  .get("/templates", (c) => c.json({ templates: getTrainingCatalog(c.get("locale")) }));
