import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { VERIFICATION_RESEND_WINDOW_SECONDS } from "@turingcare/shared";
import { sql } from "drizzle-orm";
import { type DB, db } from "../db";
import { env } from "../env";
import { purgeVerificationLimits, verificationRetentionFailure } from "./verification-retention";

type LimitKind = "ip" | "credential" | "send";
const limits: Record<LimitKind, number> = { ip: 20, credential: 5, send: 1 };
const WINDOW_MS = VERIFICATION_RESEND_WINDOW_SECONDS * 1000;

export function verificationLimitKey(kind: LimitKind, value: string): string {
  const digest = createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`verification:${kind}:${value.trim().toLowerCase()}`)
    .digest("hex");
  return `verification:${kind}:${digest}`;
}

export function trustedVerificationIp(headers: Headers): string | null {
  // Fly overwrites this header at the edge. Never use client-supplied XFF.
  const ip = headers.get("fly-client-ip")?.trim();
  return ip && isIP(ip) ? ip : env.NODE_ENV === "production" ? null : "unknown";
}

/**
 * Atomic across processes/routes: the existing primary key provides conflict
 * arbitration (rate_limit.key is not unique). Database time avoids clock skew.
 * Counts saturate; denied requests do not extend the window.
 */
export async function consumeVerificationLimit(
  kind: LimitKind,
  value: string,
  database: DB = db,
): Promise<number> {
  const key = verificationLimitKey(kind, value);
  const max = limits[kind];
  const now = sql`floor(extract(epoch from clock_timestamp()) * 1000)::bigint`;
  const expired = sql`rate_limit.last_request <= ${now} - ${WINDOW_MS}`;
  const result = await database.execute<{
    count: number;
    retryAfter: number;
    inserted: boolean;
  }>(sql`
    insert into rate_limit (id, key, count, last_request)
    values (${key}, ${key}, 1, ${now})
    on conflict (id) do update set
      count = case when ${expired} then 1 else least(rate_limit.count + 1, ${max + 1}) end,
      last_request = case when ${expired} then ${now} else rate_limit.last_request end
    returning count, (xmax = 0) as inserted,
      greatest(1, least(60, ceil((last_request + ${WINDOW_MS} - ${now}) / 1000.0)))::int
      as "retryAfter"
  `);
  const row = result.rows[0];
  if (!row) throw new Error("Verification limiter unavailable");
  if (kind === "credential" && row.inserted) await maintainNewCredentialPair(database);
  return row.count > max ? row.retryAfter : 0;
}

/** Only optional maintenance is caught here, never credential/provider failures. */
async function maintainNewCredentialPair(database: DB) {
  try {
    const result = await purgeVerificationLimits(database, {
      batchSize: 100,
      maxBatches: 1,
      waitForTurn: true,
    });
    if (result.busy) {
      console.warn("[auth] verification_retention_deferred", { reason: "busy" });
    }
    // A full 100-row page is expected, not a failure: its committed cursor is
    // resumed by the next admitted new pair or by the daily fallback.
  } catch (error) {
    const diagnostic = verificationRetentionFailure(error);
    if (diagnostic.reason === "busy") {
      console.warn("[auth] verification_retention_deferred", diagnostic);
    } else {
      console.error("[auth] verification_retention_failed", diagnostic);
    }
  }
}

export function verificationRateLimited(retryAfter: number): Response {
  return Response.json(
    { error: "rate_limited", retryAfter },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfter), "X-Retry-After": String(retryAfter) },
    },
  );
}
