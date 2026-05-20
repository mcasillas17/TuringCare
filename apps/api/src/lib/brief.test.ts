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
});
