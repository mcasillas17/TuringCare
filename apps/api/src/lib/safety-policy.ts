import type { SafetySignalType, SuggestionSafety } from "@turingcare/shared";
import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import { dogSafetySignals, journalEntries } from "../db/schema";
import { type TransactionType, withDogSafetyLock, withDogSafetySharedLock } from "./safety-lock";

/** Time-bounded medical reports stay in policy for this long. */
export const SAFETY_SIGNAL_WINDOW_DAYS = 90;
/** Window for the "things are getting worse" pattern. */
export const WORSENING_WINDOW_DAYS = 14;
export const HIGH_INTENSITY_THRESHOLD = 4;
export const WORSENING_MIN_HIGH_INTENSITY_ENTRIES = 2;
export const WORSENING_MIN_HARDER_CHECKINS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

export type { TransactionType };

export type SafetyInputs = {
  now: Date;
  signals: {
    type: SafetySignalType | "severe_behavior_concern";
    reportedAt: Date;
  }[];
  highIntensityEntryCount: number;
  harderCheckinCount: number;
};

/**
 * Pure, conservative safety policy over *structured* inputs only. Owner free
 * text is never inspected. When this returns a decision, the suggestion engine
 * must suppress every exercise and show referral guidance instead.
 * Persisted safety signals are authoritative; behavior-concern rows are never
 * reinterpreted on reads, so a support-corrected input mistake stays corrected.
 */
export function decideSafety(inputs: SafetyInputs): SuggestionSafety | null {
  const cutoff = new Date(inputs.now.getTime() - SAFETY_SIGNAL_WINDOW_DAYS * DAY_MS);
  const active = inputs.signals.filter(
    (signal) =>
      signal.type === "severe_behavior_concern" ||
      signal.type === "aggression_or_bite_risk" ||
      signal.type === "severe_fear_or_panic" ||
      signal.reportedAt >= cutoff,
  );
  const has = (type: SafetyInputs["signals"][number]["type"]) =>
    active.some((signal) => signal.type === type);

  if (has("injury_or_pain")) {
    return { suppressed: true, ruleId: "reported_injury_or_pain", referral: "veterinarian" };
  }
  if (has("aggression_or_bite_risk")) {
    return {
      suppressed: true,
      ruleId: "reported_aggression_or_bite_risk",
      referral: "veterinary_behaviorist",
    };
  }
  if (has("severe_fear_or_panic")) {
    return {
      suppressed: true,
      ruleId: "reported_severe_fear",
      referral: "veterinary_behaviorist",
    };
  }
  if (has("severe_behavior_concern")) {
    return {
      suppressed: true,
      ruleId: "severe_recorded_concern",
      referral: "veterinary_behaviorist",
    };
  }
  if (
    inputs.highIntensityEntryCount >= WORSENING_MIN_HIGH_INTENSITY_ENTRIES &&
    inputs.harderCheckinCount >= WORSENING_MIN_HARDER_CHECKINS
  ) {
    return {
      suppressed: true,
      ruleId: "sustained_worsening_intensity",
      referral: "credentialed_trainer",
    };
  }
  return null;
}

export async function loadSafetyInputs(
  dogId: string,
  now: Date,
  executor: Pick<typeof db, "select"> = db,
): Promise<SafetyInputs> {
  const signalCutoff = new Date(now.getTime() - SAFETY_SIGNAL_WINDOW_DAYS * DAY_MS);
  const worseningCutoff = new Date(now.getTime() - WORSENING_WINDOW_DAYS * DAY_MS);

  const [signals, worsening] = await Promise.all([
    executor
      .select({ type: dogSafetySignals.type, reportedAt: dogSafetySignals.reportedAt })
      .from(dogSafetySignals)
      .where(
        and(
          eq(dogSafetySignals.dogId, dogId),
          or(
            inArray(dogSafetySignals.type, [
              "severe_behavior_concern",
              "aggression_or_bite_risk",
              "severe_fear_or_panic",
            ]),
            gte(dogSafetySignals.reportedAt, signalCutoff),
          ),
        ),
      ),
    executor
      .select({
        highIntensity: sql<number>`count(*) filter (where ${journalEntries.intensity} >= ${HIGH_INTENSITY_THRESHOLD})`,
        harder: sql<number>`count(*) filter (where ${journalEntries.kind} = 'daily_checkin' and ${journalEntries.trend} = 'harder')`,
      })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.dogId, dogId),
          gte(journalEntries.occurredAt, worseningCutoff),
          lte(journalEntries.occurredAt, now),
        ),
      ),
  ]);

  const counts = worsening[0];
  return {
    now,
    signals,
    highIntensityEntryCount: Number(counts?.highIntensity ?? 0),
    harderCheckinCount: Number(counts?.harder ?? 0),
  };
}

export async function evaluateSafety(dogId: string, now: Date): Promise<SuggestionSafety | null> {
  return decideSafety(await loadSafetyInputs(dogId, now));
}

async function evaluateSafetyInLockedTransaction<T>(
  dogId: string,
  tx: TransactionType,
  callback: (decision: SuggestionSafety | null, tx: TransactionType, lockedNow: Date) => Promise<T>,
): Promise<T> {
  const lockedNow = new Date();
  const decision = decideSafety(await loadSafetyInputs(dogId, lockedNow, tx));
  return await callback(decision, tx, lockedNow);
}

/**
 * Holds the exclusive safety lock through a guarded write, making the decision
 * and action a single linearization point. The clock is sampled only after
 * lock acquisition, then shared by the decision and guarded callback.
 */
export async function evaluateSafetyWithLock<T>(
  dogId: string,
  callback: (decision: SuggestionSafety | null, tx: TransactionType, lockedNow: Date) => Promise<T>,
): Promise<T> {
  return withDogSafetyLock(dogId, (tx) => evaluateSafetyInLockedTransaction(dogId, tx, callback));
}

/**
 * Holds a shared safety lock through a safety decision and derivation that do
 * not mutate safety inputs. The clock is sampled only after lock acquisition,
 * then shared by every bounded read.
 */
export async function evaluateSafetyWithSharedLock<T>(
  dogId: string,
  callback: (decision: SuggestionSafety | null, tx: TransactionType, lockedNow: Date) => Promise<T>,
): Promise<T> {
  return withDogSafetySharedLock(dogId, (tx) =>
    evaluateSafetyInLockedTransaction(dogId, tx, callback),
  );
}
