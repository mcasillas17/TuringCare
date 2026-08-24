import type { Locale } from "@turingcare/i18n";
import { Hono } from "hono";
import { getTrainingCurriculum } from "../data/training-curriculum";
import { type Vars, requireUser } from "../middleware/require-user";

export const trainingApp = new Hono<{ Variables: Vars & { locale: Locale } }>()
  .use("*", requireUser)
  .get("/templates", (c) => c.json({ templates: getTrainingCurriculum(c.get("locale")) }));
