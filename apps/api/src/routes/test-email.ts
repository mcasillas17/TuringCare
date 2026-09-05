import { Hono } from "hono";
import { findLatestTestEmail } from "../email/test-outbox";
import { env } from "../env";

export function createTestEmailApp({ enabled }: { enabled: boolean }) {
  const app = new Hono();

  app.get("/emails/latest", (c) => {
    if (!enabled || env.NODE_ENV === "production") return c.notFound();

    const to = (c.req.query("to") ?? "").trim();
    if (!to) return c.json({ error: "recipient_required" } as const, 400);

    const email = findLatestTestEmail(to);
    if (!email) return c.json({ error: "not_found" } as const, 404);

    return c.json({ email } as const);
  });

  return app;
}
