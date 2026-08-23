import { en } from "@turingcare/i18n";
import { describe, expect, it } from "vitest";
import { TURING_TIP_BUCKETS, tipContextForPath } from "./turing-tips";

describe("tipContextForPath", () => {
  it.each([
    ["/my/dogs/abc/training", "training"],
    ["/my/dogs/abc/journal", "journal"],
    ["/my/journal", "journal"],
    ["/my/dogs/abc/week", "week"],
    ["/my/dogs/abc/brief", "brief"],
    ["/my/brief", "brief"],
    ["/my", "general"],
    ["/my/dogs/abc", "general"],
  ] as const)("%s -> %s", (path, ctx) => {
    expect(tipContextForPath(path)).toBe(ctx);
  });
});

describe("TURING_TIP_BUCKETS", () => {
  it("every key resolves to a real en catalog string", () => {
    for (const keys of Object.values(TURING_TIP_BUCKETS)) {
      for (const k of keys) {
        const leaf = k.split(".")[1] as keyof typeof en.turing;
        expect(typeof en.turing[leaf]).toBe("string");
      }
    }
  });
});
