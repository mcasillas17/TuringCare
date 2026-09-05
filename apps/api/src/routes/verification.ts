import { verificationConfirmSchema, verificationResendSchema } from "@turingcare/shared";
import { Hono } from "hono";
import { resendVerification, verificationResendHeaders } from "../auth/resend-verification";
import { confirmVerification, verificationStatus } from "../auth/verification-proof";
import { stableZValidator } from "../middleware/validation";

export const verificationApp = new Hono()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  })
  .get("/status", async (c) => c.json(await verificationStatus(c.req.raw)))
  .post("/confirm", stableZValidator("json", verificationConfirmSchema), async (c) => {
    const result = await confirmVerification(c.req.raw);
    if (result.status === 200 && result.cookie) c.header("Set-Cookie", result.cookie);
    if (result.status === 429) {
      c.header("Retry-After", String(result.body.retryAfter));
      c.header("X-Retry-After", String(result.body.retryAfter));
    }
    return c.json(result.body, result.status);
  })
  .post("/resend", stableZValidator("json", verificationResendSchema), async (c) => {
    const result = await resendVerification(c.req.raw, c.req.valid("json"));
    return c.json(result.body, result.status, verificationResendHeaders(result));
  });
