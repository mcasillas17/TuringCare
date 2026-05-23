import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { practiceSessions, trainingSkills } from "./schema";

describe("training progress tables", () => {
  it("exports the expected table names", () => {
    expect(getTableName(trainingSkills)).toBe("training_skills");
    expect(getTableName(practiceSessions)).toBe("practice_sessions");
  });
});
