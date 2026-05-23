import { describe, expect, it } from "vitest";
import { composeBrief } from "./brief";

describe("composeBrief", () => {
  const dog = { name: "Biscuit", breed: "Aussie", size: "medium", sex: "female" };
  it("includes name, concerns, goals, journal stats deterministically", () => {
    const out = composeBrief({
      dog,
      concerns: [{ concern: "Leash reactivity", severity: "moderate" }],
      goals: [{ goal: "Calm greetings" }],
      entries: [
        { behavior: "Barked", intensity: 4, occurredAt: "2026-05-18T10:00:00.000Z" },
        { behavior: "Lunged", intensity: 2, occurredAt: "2026-05-17T10:00:00.000Z" },
      ],
    });
    expect(out).toContain("Biscuit");
    expect(out).toContain("Leash reactivity (moderate)");
    expect(out).toContain("Calm greetings");
    expect(out).toContain("2 journal");
    expect(out).toContain("average intensity 3.0");
    expect(composeBrief({ dog, concerns: [], goals: [], entries: [] })).toBe(
      composeBrief({ dog, concerns: [], goals: [], entries: [] }),
    );
  });

  it("renders training progress and omits zero-skill goals", () => {
    const out = composeBrief({
      dog,
      concerns: [],
      goals: [{ goal: "Calm greetings" }],
      entries: [],
      progress: [
        {
          id: "g1",
          goal: "Calm greetings",
          avgConfidence: 3,
          skills: [
            {
              id: "s1",
              name: "Door-knock threshold",
              confidence: 3,
              position: 0,
              sessionCount: 2,
              firstSessionAt: "2026-05-01T10:00:00.000Z",
              lastSessionAt: "2026-05-22T10:00:00.000Z",
              lastNote: "held sit through a very long note that should stay readable",
              sessions: [],
            },
            {
              id: "s2",
              name: "Greeting strangers",
              confidence: 2,
              position: 1,
              sessionCount: 0,
              firstSessionAt: null,
              lastSessionAt: null,
              lastNote: null,
              sessions: [],
            },
          ],
        },
        { id: "g2", goal: "Empty goal", avgConfidence: null, skills: [] },
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
    const out = composeBrief({ dog, concerns: [], goals: [], entries: [], progress: [] });
    expect(out).not.toContain("Training progress:");
  });
});
