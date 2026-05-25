import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  journalEntries,
  journalEntryKindEnum,
  journalTrendEnum,
  practiceSessions,
  trainingSkills,
} from "./schema";

describe("training progress tables", () => {
  it("exports the expected table names", () => {
    expect(getTableName(trainingSkills)).toBe("training_skills");
    expect(getTableName(practiceSessions)).toBe("practice_sessions");
  });
});

describe("journal schema", () => {
  it("exports journal entry kinds and trends", () => {
    expect(getTableName(journalEntries)).toBe("journal_entries");
    expect(journalEntryKindEnum.enumValues).toEqual(["moment", "daily_checkin"]);
    expect(journalTrendEnum.enumValues).toEqual(["better", "same", "harder"]);
  });
});
