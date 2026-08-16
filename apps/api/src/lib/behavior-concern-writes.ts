import type { BehaviorConcernInput, SafetySignalType } from "@turingcare/shared";
import { behaviorConcerns, dogSafetySignals } from "../db/schema";
import { lockDogSafety, type TransactionType } from "./safety-lock";

export async function createBehaviorConcern(
  executor: TransactionType,
  dogId: string,
  input: BehaviorConcernInput,
) {
  const { safetySignal, ...concernInput } = input;
  const reportedSignals: Array<SafetySignalType | "severe_behavior_concern"> = [
    ...(input.severity === "severe" ? (["severe_behavior_concern"] as const) : []),
    ...(safetySignal ? ([safetySignal] as const) : []),
  ];

  await lockDogSafety(executor, dogId);

  const [concern] = await executor
    .insert(behaviorConcerns)
    .values({ ...concernInput, dogId })
    .returning();
  if (!concern) throw new Error("failed to create behavior concern");

  if (safetySignal) {
    await executor.insert(dogSafetySignals).values({
      dogId,
      type: safetySignal,
      source: "behavior_concern",
      reportedAt: new Date(),
    });
  }

  return { concern, reportedSignals };
}
