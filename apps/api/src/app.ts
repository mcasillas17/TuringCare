import { zValidator } from "@hono/zod-validator";
import { loginSchema, registerSchema } from "@turingcare/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "./auth";
import { resolveAdminRole } from "./auth/admin-bootstrap";
import { env } from "./env";
import { globalRateLimit } from "./middleware/rate-limit";
import { adminApp } from "./routes/admin";
import { adminCoursesApp } from "./routes/admin-courses";
import { adminTrainersApp } from "./routes/admin-trainers";
import { coursesApp } from "./routes/courses";
import { dogsApp } from "./routes/dogs";
import { journalApp } from "./routes/journal";
import { onboardingApp } from "./routes/onboarding";
import { overviewApp } from "./routes/overview";
import { profileApp } from "./routes/profile";
import { shareApp } from "./routes/share";
import { createTestEmailApp } from "./routes/test-email";
import { trainersApp } from "./routes/trainers";
import { trainingApp } from "./routes/training";
import { eventIngestSchema } from "./telemetry/events";
import { recordEvent } from "./telemetry/record-event";

const app = new Hono()
  .use(
    "*",
    secureHeaders({
      xContentTypeOptions: "nosniff",
      xFrameOptions: "DENY",
      referrerPolicy: "strict-origin-when-cross-origin",
      // No Content-Security-Policy here: this is a JSON API, not an HTML app.
    }),
  )
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
  .route("/api/journal", journalApp)
  .route("/api/share", shareApp)
  .route("/api/onboarding", onboardingApp)
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
  .route("/api/training", trainingApp)
  .route("/api/trainers", trainersApp)
  .route("/api/profile", profileApp)
  .route("/api/admin", adminApp)
  .route("/api/admin/courses", adminCoursesApp)
  .route("/api/admin/trainers", adminTrainersApp)
  .route("/api/test", createTestEmailApp({ enabled: env.E2E_TEST_MODE }))
  .on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export { app };
export type AppType = typeof app;
