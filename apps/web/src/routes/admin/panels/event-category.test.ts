import { describe, expect, it } from "vitest";
import { CATEGORIES, eventCategory } from "./event-category";

describe("eventCategory", () => {
  it("maps event names to categories", () => {
    expect(eventCategory("page.viewed")).toBe("pageViews");
    expect(eventCategory("training.level_set")).toBe("training");
    expect(eventCategory("focus.week_set")).toBe("training");
    expect(eventCategory("journal.entry_created")).toBe("journalDogs");
    expect(eventCategory("dog.created")).toBe("journalDogs");
    expect(eventCategory("brief.emailed")).toBe("briefs");
    expect(eventCategory("trainer.viewed")).toBe("directory");
    expect(eventCategory("course.viewed")).toBe("directory");
    expect(eventCategory("user.signed_in")).toBe("auth");
    expect(eventCategory("something.weird")).toBe("other");
  });

  it("exposes every category with a label and color", () => {
    expect(CATEGORIES.map((c) => c.key)).toContain("pageViews");
    for (const c of CATEGORIES) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.color).toMatch(/^#/);
    }
  });
});
