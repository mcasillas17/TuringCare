import type { JournalEntryCreateInput } from "@turingcare/shared";
import { journalEntries } from "../db/schema";
import { type TransactionType, lockDogSafety } from "./safety-lock";

export class InvalidJournalOccurredAtError extends Error {
  declare readonly occurredAtInput: string;

  constructor(occurredAtInput: string) {
    super("invalid journal occurredAt");
    this.name = "InvalidJournalOccurredAtError";
    Object.defineProperty(this, "occurredAtInput", {
      value: occurredAtInput,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
}

export async function createJournalEntry(
  executor: TransactionType,
  dogId: string,
  input: JournalEntryCreateInput,
) {
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    throw new InvalidJournalOccurredAtError(input.occurredAt ?? "");
  }

  await lockDogSafety(executor, dogId);

  const [entry] = await executor
    .insert(journalEntries)
    .values({
      dogId,
      kind: input.kind,
      occurredAt,
      note: input.note,
      trend: input.kind === "daily_checkin" ? input.trend : null,
      antecedent: input.kind === "moment" ? (input.antecedent ?? null) : null,
      behavior: input.kind === "moment" ? (input.behavior ?? null) : null,
      consequence: input.kind === "moment" ? (input.consequence ?? null) : null,
      intensity: input.kind === "moment" ? (input.intensity ?? null) : null,
      location: input.kind === "moment" ? (input.location ?? null) : null,
      notes: input.kind === "moment" ? (input.notes ?? null) : null,
      durationSeconds: input.kind === "moment" ? (input.durationSeconds ?? null) : null,
      recoverySeconds: input.kind === "moment" ? (input.recoverySeconds ?? null) : null,
      peoplePresent: input.kind === "moment" ? (input.peoplePresent ?? null) : null,
      ownerResponse: input.kind === "moment" ? (input.ownerResponse ?? null) : null,
    })
    .returning();
  if (!entry) throw new Error("failed to create journal entry");
  return entry;
}
