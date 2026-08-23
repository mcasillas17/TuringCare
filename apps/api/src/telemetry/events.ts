import { z } from "zod";

/** Every event name the system may record (server- or client-emitted). */
export const KNOWN_EVENTS = [
  "user.signed_up",
  "user.signed_in",
  "page.viewed",
  "dog.created",
  "journal.entry_created",
  "brief.generated",
  "brief.finalized",
  "brief.shared",
  "brief.emailed",
  "guided_setup.started",
  "guided_setup.dog_basics_completed",
  "guided_setup.intent_selected",
  "guided_setup.first_action_completed",
  "guided_setup.first_action_skipped",
  "guided_setup.completed",
  "training.goal_added",
  "training.practice_logged",
  "focus.week_set",
  "focus.legacy_compat_used",
  "training.practice_outcome_recorded",
  "training.suggestion_shown",
  "training.suggestion_action",
  "training.advancement_proposed",
  "training.advancement_decided",
  "safety.signal_reported",
  "safety.suppression_shown",
  "training.level_set",
  "training.context_insight_viewed",
  "training.context_next_action_used",
  "trainer.viewed",
  "course.viewed",
] as const;

export type EventName = (typeof KNOWN_EVENTS)[number];

const KNOWN = new Set<string>(KNOWN_EVENTS);
export function isKnownEvent(name: string): name is EventName {
  return KNOWN.has(name);
}

/** Names a browser client is allowed to submit via POST /api/events. */
export const CLIENT_EVENTS = ["page.viewed", "trainer.viewed", "course.viewed"] as const;

const scalar = z.union([z.string(), z.number(), z.boolean()]);
type EventProp = z.infer<typeof scalar>;
type EventProps = Record<string, EventProp>;

const publicBriefPath = /^\/b\/[^/]+\/?$/;

export function normalizeEventProps(
  name: (typeof CLIENT_EVENTS)[number],
  props: EventProps,
): EventProps {
  const path = props.path;
  if (name !== "page.viewed" || typeof path !== "string" || !publicBriefPath.test(path)) {
    return props;
  }

  return { ...props, path: "/b/:token" };
}

/** Validated, privacy-safe ingest payload: scalar-only props, size-capped. */
export const eventIngestSchema = z
  .object({
    name: z.enum(CLIENT_EVENTS),
    props: z
      .record(scalar)
      .default({})
      .refine((p) => Buffer.byteLength(JSON.stringify(p), "utf8") <= 1024, "props too large"),
  })
  .transform(({ name, props }) => ({ name, props: normalizeEventProps(name, props) }));

export type EventIngest = z.infer<typeof eventIngestSchema>;
