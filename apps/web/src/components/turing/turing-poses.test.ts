import { describe, expect, it } from "vitest";
import { posePresentation } from "./turing-poses";

describe("posePresentation", () => {
  it("idle: slow breathe + sway, mouth closed, awake", () => {
    const p = posePresentation("idle", false);
    expect(p.bodyAnim).toContain("tg-breathe-slow");
    expect(p.tailAnim).toContain("tg-sway");
    expect(p.mouthOpen).toBe(false);
    expect(p.sleeping).toBe(false);
    expect(p.wrapperAnim).toBe("none");
  });

  it("tilt: head rotates and ears splay", () => {
    const p = posePresentation("tilt", false);
    expect(p.headTransform).toBe("rotate(-13deg)");
    expect(p.earLrot).toBe(-7);
    expect(p.earRrot).toBe(6);
  });

  it("wag: faster tail + open mouth", () => {
    const p = posePresentation("wag", false);
    expect(p.tailAnim).toContain("tg-wag ");
    expect(p.mouthOpen).toBe(true);
  });

  it("celebrate: hop wrapper + fast wag + open mouth, body still", () => {
    const p = posePresentation("celebrate", false);
    expect(p.wrapperAnim).toContain("tg-hop");
    expect(p.tailAnim).toContain("tg-wag-fast");
    expect(p.mouthOpen).toBe(true);
    expect(p.bodyAnim).toBe("none");
  });

  it("sleep: slowest breathe, tail still, head droops, sleeping flag", () => {
    const p = posePresentation("sleep", false);
    expect(p.bodyAnim).toContain("5.8s");
    expect(p.tailAnim).toBe("none");
    expect(p.headTransform).toBe("rotate(9deg) translateY(7px)");
    expect(p.sleeping).toBe(true);
  });

  it("reduced motion: no looping animations, but pose semantics intact", () => {
    const p = posePresentation("celebrate", true);
    expect(p.wrapperAnim).toBe("none");
    expect(p.bodyAnim).toBe("none");
    expect(p.tailAnim).toBe("none");
    expect(p.mouthOpen).toBe(true); // static pose still "open mouth"
  });
});
