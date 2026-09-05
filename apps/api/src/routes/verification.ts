import { verificationResendSchema } from "@turingcare/shared";
import { Hono } from "hono";
import { resendVerification, verificationResendHeaders } from "../auth/resend-verification";
import { stableZValidator } from "../middleware/validation";

export const verificationApp = new Hono().post(
  "/resend",
  stableZValidator("json", verificationResendSchema),
  async (c) => {
    const result = await resendVerification(c.req.raw, c.req.valid("json"));
    return c.json(result.body, result.status, verificationResendHeaders(result));
  },
);
