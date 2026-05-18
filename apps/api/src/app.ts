import { zValidator } from "@hono/zod-validator";
import { loginSchema, registerSchema } from "@turingcare/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth";
import { env } from "./env";
import { globalRateLimit } from "./middleware/rate-limit";
import { dogsApp } from "./routes/dogs";

const app = new Hono()
  .use(
    "*",
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
      allowHeaders: ["Content-Type"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    }),
  )
  .use("*", globalRateLimit())
  .get("/health", (c) => c.json({ status: "ok" } as const))
  .get("/me", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "unauthorized" } as const, 401);
    return c.json({ user: session.user });
  })
  .post("/api/validate/register", zValidator("json", registerSchema), (c) =>
    c.json({ ok: true } as const),
  )
  .post("/api/validate/login", zValidator("json", loginSchema), (c) =>
    c.json({ ok: true } as const),
  )
  .route("/api/dogs", dogsApp)
  .on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export { app };
export type AppType = typeof app;
