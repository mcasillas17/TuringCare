import { describe, expect, it } from "vitest";
import { composeBrief } from "./brief";

describe("composeBrief", () => {
  const dog = { name: "Biscuit", breed: "Aussie", size: "medium", sex: "female" };
  it("includes name, concerns, goals, and note-first journal stats deterministically", () => {
    const out = composeBrief({
      dog,
      concerns: [{ concern: "Leash reactivity", severity: "moderate" }],
      goals: [{ goal: "Calm greetings" }],
      windowDays: 30,
      entries: [
        {
          note: "Barked at delivery truck",
          kind: "moment",
          behavior: "Barked",
          intensity: 4,
          occurredAt: "2026-05-18T10:00:00.000Z",
        },
        {
          note: "Recovered faster on walk",
          kind: "moment",
          behavior: null,
          intensity: null,
          occurredAt: "2026-05-17T10:00:00.000Z",
        },
      ],
    });
    expect(out).toContain("Biscuit");
    expect(out).toContain("Leash reactivity (moderate)");
    expect(out).toContain("Calm greetings");
    expect(out).toContain("2 entries in the last 30 days");
    expect(out).toContain("average intensity 4.0");
    expect(out).toContain("Barked at delivery truck");
    expect(out).toContain("Recovered faster on walk");
    expect(composeBrief({ dog, concerns: [], goals: [], entries: [], windowDays: 30 })).toBe(
      composeBrief({ dog, concerns: [], goals: [], entries: [], windowDays: 30 }),
    );
  });

  it("renders training progress and omits zero-skill goals", () => {
    const out = composeBrief({
      dog,
      concerns: [],
      goals: [{ goal: "Calm greetings" }],
      entries: [],
      windowDays: 30,
      progress: [
        {
          id: "g1",
          goal: "Calm greetings",
          catalogGoalKey: null,
          avgConfidence: 3,
          skills: [
            {
              id: "s1",
              name: "Door-knock threshold",
              confidence: 3,
              position: 0,
              catalogSkillKey: null,
              sessionCount: 2,
              firstSessionAt: "2026-05-01T10:00:00.000Z",
              lastSessionAt: "2026-05-22T10:00:00.000Z",
              lastNote: "held sit through a very long note that should stay readable",
              sessions: [],
              milestones: [],
            },
            {
              id: "s2",
              name: "Greeting strangers",
              confidence: 2,
              position: 1,
              catalogSkillKey: null,
              sessionCount: 0,
              firstSessionAt: null,
              lastSessionAt: null,
              lastNote: null,
              sessions: [],
              milestones: [],
            },
          ],
        },
        { id: "g2", goal: "Empty goal", catalogGoalKey: null, avgConfidence: null, skills: [] },
      ],
    });
    expect(out).toContain("Training progress:");
    expect(out).toContain("Calm greetings");
    expect(out).toContain("Sometimes (3.0/5)");
    expect(out).toContain("Door-knock threshold -- 3/5, 2 sessions");
    expect(out).toContain("Greeting strangers -- 2/5, no sessions yet");
    expect(out).not.toContain("Empty goal");
  });

  it("omits training progress when no goals exist", () => {
    const out = composeBrief({
      dog,
      concerns: [],
      goals: [],
      entries: [],
      windowDays: 30,
      progress: [],
    });
    expect(out).not.toContain("Training progress:");
  });

  it("tallies check-in trends and caps the entry list at 10 within the window", () => {
    const entries = [];
    for (let n = 0; n < 12; n++) {
      entries.push({
        note: `moment ${n}`,
        kind: "moment" as const,
        occurredAt: `2026-05-${String(10 + n).padStart(2, "0")}T10:00:00.000Z`,
      });
    }
    entries.push({
      note: "good",
      kind: "daily_checkin" as const,
      trend: "better" as const,
      occurredAt: "2026-05-23T09:00:00.000Z",
    });
    entries.push({
      note: "good2",
      kind: "daily_checkin" as const,
      trend: "better" as const,
      occurredAt: "2026-05-22T09:00:00.000Z",
    });
    entries.push({
      note: "meh",
      kind: "daily_checkin" as const,
      trend: "same" as const,
      occurredAt: "2026-05-24T09:00:00.000Z",
    });
    entries.push({
      note: "rough",
      kind: "daily_checkin" as const,
      trend: "harder" as const,
      occurredAt: "2026-05-25T09:00:00.000Z",
    });

    const out = composeBrief({ dog, concerns: [], goals: [], entries, windowDays: 30 });

    expect(out).toContain("16 entries in the last 30 days");
    expect(out).toContain("Check-ins: 2 better, 1 same, 1 harder.");
    const listed = out.split("\n").filter((line) => /^- \d{4}-\d{2}-\d{2}:/.test(line));
    expect(listed).toHaveLength(10);
  });

  it("labels all-time and omits the check-ins line when there are none", () => {
    const out = composeBrief({
      dog,
      concerns: [],
      goals: [],
      windowDays: null,
      entries: [{ note: "solo moment", kind: "moment", occurredAt: "2026-05-20T10:00:00.000Z" }],
    });
    expect(out).toContain("1 entry (all time)");
    expect(out).not.toContain("Check-ins:");
  });
});
