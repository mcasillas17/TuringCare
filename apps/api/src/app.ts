import { loginSchema, registerSchema } from "@turingcare/shared";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { auth } from "./auth";
import { resolveAdminRole } from "./auth/admin-bootstrap";
import { db } from "./db";
import { env } from "./env";
import { type LocaleEnv, localeMiddleware } from "./middleware/locale";
import { globalRateLimit } from "./middleware/rate-limit";
import { stableZValidator } from "./middleware/validation";
import { createMonitoringAuthHandler } from "./monitoring/auth-handler";
import { createMonitoringErrorHandler } from "./monitoring/error-handler";
import { type ApiEnv, requestIdMiddleware } from "./monitoring/request-id";
import { adminApp } from "./routes/admin";
import { adminCoursesApp } from "./routes/admin-courses";
import { adminTrainersApp } from "./routes/admin-trainers";
import { coursesApp } from "./routes/courses";
import { dogsApp } from "./routes/dogs";
import { guidedSetupApp } from "./routes/guided-setup";
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

const app = new Hono<ApiEnv & LocaleEnv>()
  .use("*", requestIdMiddleware)
  .use("*", localeMiddleware)
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
      allowHeaders: ["Content-Type", "X-TuringCare-Locale"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["X-Request-ID"],
    }),
  )
  .use("*", globalRateLimit())
  .get("/health", (c) => c.json({ status: "ok" } as const))
  .get("/ready", async (c) => {
    try {
      await db.execute(sql`
        select
          wf."week_start",
          fcw."session_id",
          lfc."claimed_at",
          ps."practice_day",
          ps."curriculum_version",
          ds."type",
          ts."curriculum_version",
          tsa."action",
          ap."status",
          u."locale",
          b."locale"
        from "weekly_focus" wf
        left join "focus_compatibility_weeks" fcw on false
        left join "legacy_focus_claims" lfc on false
        left join "practice_sessions" ps on false
        left join "dog_safety_signals" ds on false
        left join "training_suggestions" ts on false
        left join "training_suggestion_actions" tsa on false
        left join "advancement_proposals" ap on false
        left join "user" u on false
        left join "briefs" b on false
        limit 0
      `);
      return c.json({ status: "ready" } as const);
    } catch (error) {
      console.error("[ready] database_not_ready", { error });
      return c.json({ error: "database_not_ready" } as const, 503);
    }
  })
  .get("/me", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "unauthorized" } as const, 401);
    const role = await resolveAdminRole(session.user);
    return c.json({ user: { ...session.user, role } });
  })
  .post("/api/validate/register", stableZValidator("json", registerSchema), (c) =>
    c.json({ ok: true } as const),
  )
  .post("/api/validate/login", stableZValidator("json", loginSchema), (c) =>
    c.json({ ok: true } as const),
  )
  .route("/api/dogs", dogsApp)
  .route("/api/journal", journalApp)
  .route("/api/share", shareApp)
  .route("/api/onboarding", onboardingApp)
  .route("/api/guided-setup", guidedSetupApp)
  .post("/api/events", stableZValidator("json", eventIngestSchema), async (c) => {
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
  .on(
    ["POST", "GET"],
    "/api/auth/*",
    createMonitoringAuthHandler((req) => auth.handler(req)),
  );

app.onError(createMonitoringErrorHandler<ApiEnv & LocaleEnv>());

export { app };
export type AppType = typeof app;
