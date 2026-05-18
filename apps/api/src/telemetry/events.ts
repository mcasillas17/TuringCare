import { z } from "zod";

/** Every event name the system may record (server- or client-emitted). */
export const KNOWN_EVENTS = [
  "user.signed_up",
  "user.signed_in",
  "page.viewed",
  "dog.created",
  "journal.entry_created",
  "brief.generated",
] as const;

export type EventName = (typeof KNOWN_EVENTS)[number];

const KNOWN = new Set<string>(KNOWN_EVENTS);
export function isKnownEvent(name: string): name is EventName {
  return KNOWN.has(name);
}

/** Names a browser client is allowed to submit via POST /api/events. */
export const CLIENT_EVENTS = ["page.viewed"] as const;

const scalar = z.union([z.string(), z.number(), z.boolean()]);

/** Validated, privacy-safe ingest payload: scalar-only props, size-capped. */
export const eventIngestSchema = z.object({
  name: z.enum(CLIENT_EVENTS),
  props: z
    .record(scalar)
    .default({})
    .refine((p) => JSON.stringify(p).length <= 1024, "props too large"),
});

export type EventIngest = z.infer<typeof eventIngestSchema>;
