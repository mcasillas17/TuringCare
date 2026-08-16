import { z } from "zod";

/** Every event name the system may record (server- or client-emitted). */
export const KNOWN_EVENTS = [
  "user.signed_up",
  "user.signed_in",
  "page.viewed",
  "dog.created",
  "dog.updated",
  "dog.deleted",
  "concern.added",
  "concern.removed",
  "journal.entry_created",
  "journal.entry_updated",
  "journal.entry_deleted",
  "brief.generated",
  "brief.finalized",
  "brief.shared",
  "brief.unshared",
  "brief.emailed",
  "training.goal_added",
  "training.goal_removed",
  "training.skill_added",
  "training.skill_updated",
  "training.skill_removed",
  "training.practice_logged",
  "training.practice_updated",
  "training.practice_deleted",
  "focus.week_set",
  "focus.week_removed",
  "focus.legacy_compat_used",
  "training.practice_outcome_recorded",
  "training.suggestion_shown",
  "training.suggestion_action",
  "training.advancement_proposed",
  "training.advancement_decided",
  "safety.signal_reported",
  "safety.suppression_shown",
  "training.level_set",
  "trainer.viewed",
  "course.viewed",
  "directory.trainers_searched",
  "directory.courses_searched",
  "share.brief_viewed",
  "profile.updated",
] as const;

export type EventName = (typeof KNOWN_EVENTS)[number];

const KNOWN = new Set<string>(KNOWN_EVENTS);
export function isKnownEvent(name: string): name is EventName {
  return KNOWN.has(name);
}

/** Names a browser client is allowed to submit via POST /api/events. */
export const CLIENT_EVENTS = ["page.viewed", "trainer.viewed", "course.viewed"] as const;

const scalar = z.union([z.string(), z.number(), z.boolean()]);

/** Validated, privacy-safe ingest payload: scalar-only props, size-capped. */
export const eventIngestSchema = z.object({
  name: z.enum(CLIENT_EVENTS),
  props: z
    .record(scalar)
    .default({})
    .refine((p) => Buffer.byteLength(JSON.stringify(p), "utf8") <= 1024, "props too large"),
});

export type EventIngest = z.infer<typeof eventIngestSchema>;
