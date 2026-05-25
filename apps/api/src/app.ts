import { zValidator } from "@hono/zod-validator";
import { loginSchema, registerSchema } from "@turingcare/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth";
import { resolveAdminRole } from "./auth/admin-bootstrap";
import { env } from "./env";
import { globalRateLimit } from "./middleware/rate-limit";
import { adminApp } from "./routes/admin";
import { adminTrainersApp } from "./routes/admin-trainers";
import { coursesApp } from "./routes/courses";
import { dogsApp } from "./routes/dogs";
import { overviewApp } from "./routes/overview";
import { profileApp } from "./routes/profile";
import { shareApp } from "./routes/share";
import { trainersApp } from "./routes/trainers";
import { eventIngestSchema } from "./telemetry/events";
import { recordEvent } from "./telemetry/record-event";

const app = new Hono()
  .use(
    "*",
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      allowHeaders: ["Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  )
  .use("*", globalRateLimit())
  .get("/health", (c) => c.json({ status: "ok" } as const))
  .get("/me", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "unauthorized" } as const, 401);
    const role = await resolveAdminRole(session.user);
    return c.json({ user: { ...session.user, role } });
  })
  .post("/api/validate/register", zValidator("json", registerSchema), (c) =>
    c.json({ ok: true } as const),
  )
  .post("/api/validate/login", zValidator("json", loginSchema), (c) =>
    c.json({ ok: true } as const),
  )
  .route("/api/dogs", dogsApp)
  .route("/api/share", shareApp)
  .post("/api/events", zValidator("json", eventIngestSchema), async (c) => {
    const { name, props } = c.req.valid("json");
    // Identity is resolved server-side from the auth cookie — never trusted
    // from the client. Anonymous (pre-auth, e.g. landing) is allowed.
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    await recordEvent(name, {
      userId: session?.user.id ?? null,
      sessionId: session?.session.id ?? null,
      props,
    });
    return c.json({ ok: true } as const, 202);
  })
  .route("/api/overview", overviewApp)
  .route("/api/courses", coursesApp)
  .route("/api/trainers", trainersApp)
  .route("/api/profile", profileApp)
  .route("/api/admin", adminApp)
  .route("/api/admin/trainers", adminTrainersApp)
  .on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export { app };
export type AppType = typeof app;
