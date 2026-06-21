/**
 * Pure mapping from a Turing pose to the CSS animation/transform values the
 * artwork applies. Values are copied from the 8-pose handoff (`Turing.dc.html`).
 * Looping animations collapse to "none" under reduced motion; pose semantics
 * (mouth open, sleeping, head transform) are preserved as a static frame.
 */
export type TuringPose = "idle" | "tilt" | "bark" | "wag" | "celebrate" | "sleep";

export type PosePresentation = {
  /** Outer wrapper animation (the celebrate hop). */
  wrapperAnim: string;
  /** Body group breathe animation. */
  bodyAnim: string;
  /** Tail group sway/wag animation. */
  tailAnim: string;
  /** Head group transform (tilt / sleep droop). */
  headTransform: string;
  earLrot: number;
  earRrot: number;
  /** Open (barking/wagging) mouth + tongue shown. */
  mouthOpen: boolean;
  /** Eyes closed + sleep smile lines + floating "zzz" shown. */
  sleeping: boolean;
};

export function posePresentation(pose: TuringPose, reduceMotion: boolean): PosePresentation {
  const sleeping = pose === "sleep";
  const mouthOpen = pose === "wag" || pose === "bark" || pose === "celebrate";

  let bodyAnim = "tg-breathe-slow 4.6s ease-in-out infinite";
  if (pose === "wag" || pose === "bark") bodyAnim = "tg-breathe 2.3s ease-in-out infinite";
  if (pose === "sleep") bodyAnim = "tg-breathe-slow 5.8s ease-in-out infinite";
  if (pose === "celebrate") bodyAnim = "none";

  let tailAnim = "tg-sway 3.6s ease-in-out infinite";
  if (pose === "wag") tailAnim = "tg-wag .5s ease-in-out infinite";
  if (pose === "bark") tailAnim = "tg-wag .58s ease-in-out infinite";
  if (pose === "celebrate") tailAnim = "tg-wag-fast .3s ease-in-out infinite";
  if (pose === "sleep") tailAnim = "none";

  let headTransform = "rotate(0deg)";
  if (pose === "tilt") headTransform = "rotate(-13deg)";
  if (pose === "sleep") headTransform = "rotate(9deg) translateY(7px)";

  const wrapperAnim = pose === "celebrate" ? "tg-hop .72s ease-in-out infinite" : "none";

  if (reduceMotion) {
    bodyAnim = "none";
    tailAnim = "none";
    return {
      wrapperAnim: "none",
      bodyAnim,
      tailAnim,
      headTransform,
      earLrot: pose === "tilt" ? -7 : 0,
      earRrot: pose === "tilt" ? 6 : 0,
      mouthOpen,
      sleeping,
    };
  }

  return {
    wrapperAnim,
    bodyAnim,
    tailAnim,
    headTransform,
    earLrot: pose === "tilt" ? -7 : 0,
    earRrot: pose === "tilt" ? 6 : 0,
    mouthOpen,
    sleeping,
  };
}
